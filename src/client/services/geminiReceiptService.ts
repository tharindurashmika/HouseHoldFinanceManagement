import type { Category, PaymentMethod } from '../../shared/types';

export interface ParsedReceiptItem {
  itemName: string;
  quantity: string;
  amountLkr: string;
  suggestedSubcategoryId?: string;
}

export interface ParsedReceiptResult {
  merchantName: string;
  transactionDate: string; // YYYY-MM-DD
  totalAmountLkr: string;
  paymentMethod: PaymentMethod;
  suggestedCategoryId: string;
  suggestedSubcategoryId: string;
  items: ParsedReceiptItem[];
  notes?: string;
  rawTextSummary?: string;
}

const STORAGE_KEY = 'hf_gemini_api_key';
const MODEL_CACHE_KEY = 'hf_gemini_resolved_model';

const PREFERRED_MODELS = [
  'models/gemini-3.8-flash',
  'models/gemini-3.5-flash-lite',
  'models/gemini-3.5-flash',
  'models/gemini-3.0-flash',
  'models/gemini-flash-latest',
  'models/gemini-2.5-flash',
  'models/gemini-2.0-flash',
  'models/gemini-2.0-flash-001',
  'models/gemini-2.0-flash-lite',
  'models/gemini-1.5-flash-latest',
  'models/gemini-1.5-flash',
];

/**
 * Queries ModelService.ListModels and returns an ordered list of candidate models
 * prioritizing Gemini 3.8 Flash / 3.5 Flash Lite and newer generations first.
 */
export async function getCandidateGeminiModels(apiKey: string): Promise<string[]> {
  const candidates: string[] = [];
  const addCandidate = (m: string) => {
    const normalized = m.startsWith('models/') ? m : `models/${m}`;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`
    );
    if (res.ok) {
      const data = await res.json();
      const models: any[] = Array.isArray(data?.models) ? data.models : [];
      const supported = models.filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          typeof m.name === 'string' &&
          !m.name.includes('tts') &&
          !m.name.includes('embedding') &&
          !m.name.includes('imagen') &&
          !m.name.includes('aqa')
      );

      const availableNames = new Set(supported.map((m) => m.name));

      // 1. Add preferred models that exist in ListModels
      for (const pref of PREFERRED_MODELS) {
        if (availableNames.has(pref)) {
          addCandidate(pref);
        }
      }

      // 2. Add any newer flash models sorted descending (e.g. gemini-4.x, gemini-3.x)
      const flashModels = supported
        .map((m) => m.name as string)
        .filter((name) => name.toLowerCase().includes('flash'))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

      for (const fm of flashModels) {
        addCandidate(fm);
      }

      // 3. Add any remaining gemini models
      for (const m of supported) {
        if (m.name.toLowerCase().includes('gemini')) {
          addCandidate(m.name);
        }
      }
    }
  } catch {
    // ignore network error on listModels and fallback to static list
  }

  for (const pref of PREFERRED_MODELS) {
    addCandidate(pref);
  }

  return candidates;
}

/**
 * Executes generateContent with automatic fallback across candidate models if a model
 * is restricted for new users (e.g., gemini-2.5-flash -> gemini-3.8-flash).
 */
async function executeGenerateContentWithFallback(
  apiKey: string,
  requestBody: any,
  forceRefresh = false
): Promise<{ data: any; modelUsed: string }> {
  const cleanKey = apiKey.trim();
  const candidates = await getCandidateGeminiModels(cleanKey);

  if (!forceRefresh && typeof window !== 'undefined') {
    const cached = localStorage.getItem(MODEL_CACHE_KEY);
    if (cached && cached.startsWith('models/')) {
      const idx = candidates.indexOf(cached);
      if (idx > 0) {
        candidates.splice(idx, 1);
      }
      if (idx !== 0) {
        candidates.unshift(cached);
      }
    }
  }

  let lastErrorMsg = 'Failed to connect to Gemini API';
  const tried = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const modelPath = candidates[i];
    if (tried.has(modelPath)) continue;
    tried.add(modelPath);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(
        cleanKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (typeof window !== 'undefined') {
        localStorage.setItem(MODEL_CACHE_KEY, modelPath);
      }
      return { data, modelUsed: modelPath };
    }

    const errJson = await res.json().catch(() => ({}));
    const msg: string = errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    lastErrorMsg = msg;

    // If the error message explicitly recommends a model (e.g. "Please update your code to use models/gemini-3.8-flash"), prioritize it next!
    const suggestedMatch = msg.match(/models\/[a-z0-9.-]+/gi);
    if (suggestedMatch) {
      for (const suggested of suggestedMatch) {
        const cleanSuggested = suggested.replace(/[.,;)'"]+$/, '');
        if (!tried.has(cleanSuggested)) {
          candidates.splice(i + 1, 0, cleanSuggested);
        }
      }
    }

    // If the error is an invalid API key or quota exhaustion (and not model availability), stop retrying
    const lowerMsg = msg.toLowerCase();
    const isModelError =
      res.status === 404 ||
      lowerMsg.includes('no longer available') ||
      lowerMsg.includes('not found') ||
      lowerMsg.includes('not supported') ||
      lowerMsg.includes('update your code to use') ||
      lowerMsg.includes('deprecated');

    if (!isModelError) {
      break;
    }
  }

  throw new Error(lastErrorMsg);
}

export function getGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY)?.trim() || '';
}

export function setGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const clean = key.trim();
  if (clean) {
    localStorage.setItem(STORAGE_KEY, clean);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function hasGeminiApiKey(): boolean {
  return Boolean(getGeminiApiKey());
}

/**
 * Resizes and compresses image on client-side canvas before uploading.
 * Max dimension: 1600px, JPEG quality: 0.85. Reduces 10MB camera photo to ~200-400KB in <100ms.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to original base64
          const raw = String(reader.result);
          const parts = raw.split(',');
          const mimeMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
          return resolve({
            base64: parts[1] || '',
            mimeType: mimeMatch?.[1] || 'image/jpeg',
          });
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Tests if the provided Gemini API key is valid by making a tiny prompt request.
 */
export async function testGeminiApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { modelUsed } = await executeGenerateContentWithFallback(
      apiKey,
      {
        contents: [{ parts: [{ text: 'Respond with the single word: OK' }] }],
        generationConfig: { maxOutputTokens: 10 },
      },
      true
    );

    const shortModelName = modelUsed.replace('models/', '');
    return {
      ok: true,
      message: `Connected! Gemini Vision (${shortModelName}) is active and ready to scan bills.`,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Network error connecting to Gemini API' };
  }
}

/**
 * Parses a Sri Lankan bill or receipt image using Google Gemini 1.5 Flash Vision.
 */
export async function parseReceiptWithGemini(
  file: File,
  categories: Category[],
  apiKeyOverride?: string
): Promise<ParsedReceiptResult> {
  const apiKey = (apiKeyOverride || getGeminiApiKey()).trim();
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }

  const { base64, mimeType } = await compressImage(file);

  // Format existing expense categories into prompt context
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  const catSummary = expenseCategories
    .map(
      (c) =>
        `- Category: "${c.name}" (ID: ${c.id})\n  Subcategories:\n${(c.subcategories || [])
          .map((sc) => `    * "${sc.name}" (ID: ${sc.id})`)
          .join('\n')}`
    )
    .join('\n\n');

  const systemInstruction = `You are an expert Sri Lankan receipt and bill OCR parser for personal household finances.
Analyze the provided receipt/bill image carefully and extract all transaction details.

Known Sri Lankan Context & Merchants:
- Supermarkets: Keells, Cargills Food City, Arpico Supercentre, Spar, Glomark, Laughs Super.
- Utilities: Ceylon Electricity Board (CEB), LECO, National Water Supply and Drainage Board (NWSDB), Sri Lanka Telecom (SLT Mobitel), Dialog Axiata, Airtel.
- Fuel / Transportation: Ceypetco (Lanka IOC / CPC fuel shed), Auto Diesel, Petrol 92/95 Octane, PickMe, Uber, Expressway Toll.
- Health: Hemas Hospitals, Asiri, Nawaloka, Durdans, Healthguard, Union Chemists, Osusala.
- Dining: Restaurants, Bakeries, Food outlets, Cafes.
- Currency is Sri Lankan Rupees (LKR). Look for "TOTAL", "NET TOTAL", "AMOUNT DUE", "LKR", "Rs.", "TOTAL AMOUNT".
- Payment Method: Detect whether paid by CASH, DEBIT_CARD, CREDIT_CARD, BANK_TRANSFER, DIGITAL_WALLET (e.g. Genie, FriMi, eZ Cash), or OTHER based on receipt text (e.g. "CASH", "VISA", "MASTERCARD", "CHANGE"). Default to "CASH" or "DEBIT_CARD" if ambiguous.
- Date: Extract the transaction date in YYYY-MM-DD format. If only DD/MM/YYYY or DD-MM-YYYY is shown, convert to YYYY-MM-DD.

Available Household Expense Categories in the app:
${catSummary}

Pick the most accurate categoryId and subcategoryId from the above list based on the merchant and purchased items.
Extract individual items if itemized lines are clearly visible on the receipt.

Return STRICT JSON only matching this schema:
{
  "merchantName": "Name of store or utility (e.g. Keells Super - Dehiwala)",
  "transactionDate": "YYYY-MM-DD",
  "totalAmountLkr": "Numeric amount string e.g. 6880.00",
  "paymentMethod": "CASH | DEBIT_CARD | CREDIT_CARD | BANK_TRANSFER | DIGITAL_WALLET | OTHER",
  "suggestedCategoryId": "UUID of matching main category from list, or empty string",
  "suggestedSubcategoryId": "UUID of matching subcategory from list, or empty string",
  "notes": "Brief notes such as invoice/receipt number or invoice tax info",
  "items": [
    {
      "itemName": "Item name",
      "quantity": "1",
      "amountLkr": "0.00",
      "suggestedSubcategoryId": "UUID or empty"
    }
  ]
}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemInstruction },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1,
    },
  };

  const { data: resultJson } = await executeGenerateContentWithFallback(apiKey, requestBody, false);
  const rawContent = resultJson?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawContent) {
    throw new Error('Gemini Vision did not return readable text from the receipt image.');
  }

  let parsed: any;
  try {
    const cleanedJson = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsed = JSON.parse(cleanedJson);
  } catch (err) {
    throw new Error('Failed to parse Gemini output as JSON: ' + rawContent.slice(0, 200));
  }

  // Validate and sanitize parsed fields
  let totalAmt = String(parsed.totalAmountLkr || '').replace(/[^0-9.]/g, '');
  if (!totalAmt || Number.isNaN(Number(totalAmt))) {
    totalAmt = '0.00';
  } else {
    totalAmt = Number(totalAmt).toFixed(2);
  }

  let txDate = String(parsed.transactionDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
    // Fallback to today if date is unparseable
    const d = new Date();
    txDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Fallback category matching if UUID is not found
  let categoryId = parsed.suggestedCategoryId || '';
  let subcategoryId = parsed.suggestedSubcategoryId || '';

  const matchedCat = expenseCategories.find((c) => c.id === categoryId);
  if (!matchedCat && expenseCategories.length > 0) {
    // Fallback to Groceries or first expense category
    const groceryCat =
      expenseCategories.find((c) => c.name.toLowerCase().includes('grocer')) || expenseCategories[0];
    categoryId = groceryCat.id;
    subcategoryId = groceryCat.subcategories?.[0]?.id || '';
  } else if (matchedCat && !matchedCat.subcategories?.some((sc) => sc.id === subcategoryId)) {
    subcategoryId = matchedCat.subcategories?.[0]?.id || '';
  }

  const validMethods: PaymentMethod[] = [
    'BANK_TRANSFER',
    'CASH',
    'CREDIT_CARD',
    'DEBIT_CARD',
    'DIGITAL_WALLET',
    'DIRECT_DEBIT',
    'OTHER',
  ];
  const paymentMethod: PaymentMethod = validMethods.includes(parsed.paymentMethod)
    ? parsed.paymentMethod
    : 'DEBIT_CARD';

  const items: ParsedReceiptItem[] = (Array.isArray(parsed.items) ? parsed.items : []).map((it: any) => ({
    itemName: String(it.itemName || '').trim(),
    quantity: String(it.quantity || '1'),
    amountLkr: Number(String(it.amountLkr || '0').replace(/[^0-9.]/g, '') || 0).toFixed(2),
    suggestedSubcategoryId: it.suggestedSubcategoryId || subcategoryId,
  }));

  return {
    merchantName: String(parsed.merchantName || 'Receipt Expense').trim(),
    transactionDate: txDate,
    totalAmountLkr: totalAmt,
    paymentMethod,
    suggestedCategoryId: categoryId,
    suggestedSubcategoryId: subcategoryId,
    items,
    notes: parsed.notes ? String(parsed.notes).trim() : undefined,
    rawTextSummary: rawContent.slice(0, 300),
  };
}


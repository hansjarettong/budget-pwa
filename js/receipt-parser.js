/**
 * receipt-parser.js - Bilingual Receipt OCR & Text Parser for Budget Tracking PWA
 * Parses Japanese and Western receipts into structured budget transactions.
 * Extracts: Total Amount, Date, Merchant Name, and Suggested Category.
 */

(function () {
  'use strict';

  // 10 Default Category Mapping & Keywords
  const CATEGORY_KEYWORDS = {
    cat_groceries: [
      // English
      'grocery', 'groceries', 'supermarket', 'market', 'produce', 'bakery', 'deli',
      'trader joe', 'whole foods', 'safeway', 'kroger', 'walmart', 'costco', 'target',
      'convenience', 'seven eleven', '7-eleven', 'family mart', 'familymart', 'lawson',
      'daiso', 'aeon', 'seiyu', 'life', 'maruetsu', 'don quijote', 'donki',
      'milk', 'bread', 'egg', 'eggs', 'fruit', 'fruits', 'vegetable', 'vegetables',
      'banana', 'bananas', 'apple', 'apples', 'cheese', 'meat', 'fresh', 'organic',
      'boulangerie', 'patisserie', 'croissant',
      // Japanese
      '食料品', 'スーパー', '食品', '青果', '精肉', '鮮魚', '野菜', '果物', '米', 'パン',
      '牛乳', '卵', 'セブン-イレブン', 'セブンイレブン', 'ファミリーマート', 'ファミマ',
      'ローソン', 'イオン', '西友', 'ライフ', '業務スーパー', '成城石井', 'マルエツ',
      'イトーヨーカドー', 'ドン・キホーテ', 'ドンキ', '八百屋', '総菜', 'お惣菜', 'おにぎり',
      'サンドイッチ', '弁当', '肉', '魚', '飲料', '水', 'お茶'
    ],
    cat_dining: [
      // English
      'dining', 'restaurant', 'cafe', 'café', 'coffee', 'bistro', 'bar', 'pub',
      'fast food', 'starbucks', 'mcdonald', 'burger', 'pizza', 'sushi', 'ramen',
      'noodles', 'diner', 'bakery cafe', 'tea', 'tacos', 'grill', 'kitchen', 'steak',
      'kfc', 'subway', 'chipotle', 'tullys', 'doutor', 'komeda', 'latte', 'cappuccino',
      'espresso', 'lunch', 'dinner', 'breakfast', 'brunch', 'cocktail', 'beer',
      'boulangerie', 'patisserie', 'croissant',
      // Japanese
      '外食', 'カフェ', '喫茶', 'コーヒー', '珈琲', 'カフェラテ', 'ラテ', 'レストラン',
      '食堂', '定食', '居酒屋', 'ランチ', 'ディナー', 'ラーメン', 'うどん', 'そば',
      '蕎麦', '寿司', '鮨', '焼肉', 'マクドナルド', 'マック', 'スタバ', 'スターバックス',
      'ドトール', 'タリーズ', 'コメダ', 'ガスト', 'サイゼリヤ', 'モスバーガー', '吉野家',
      '松屋', 'すき家', '丸亀製麺', 'バーガー', 'テイクアウト', '飲食', '料理', '酒'
    ],
    cat_transport: [
      // English
      'transport', 'transit', 'taxi', 'cab', 'uber', 'lyft', 'grab', 'subway', 'metro',
      'train', 'bus', 'rail', 'gasoline', 'gas station', 'fuel', 'petrol', 'parking',
      'toll', 'expressway', 'highway', 'airline', 'flight', 'shell', 'bp', 'exxon',
      'chevron', 'eneos', 'idemitsu', 'cosmo', 'fare', 'subway station',
      // Japanese
      '交通', 'タクシー', 'バス', '電車', '鉄道', '地下鉄', 'メトロ', '定期券', '乗車券',
      'ガソリン', '給油', 'スタンド', '駐車場', 'パーキング', '高速', 'ETC', '運賃',
      '航空', '飛行機', 'エネオス', '出光', 'コスモ', '車検', 'JR', '私鉄', 'Suica', 'Pasmo', 'ICOCA'
    ],
    cat_bills: [
      // English
      'bill', 'bills', 'utility', 'utilities', 'electric', 'electricity', 'gas bill',
      'water', 'power', 'internet', 'wifi', 'broadband', 'telecom', 'phone bill',
      'mobile', 'at&t', 'verizon', 't-mobile', 'docomo', 'softbank', 'tepco',
      'tokyo gas', 'kddi',
      // Japanese
      '光熱費', '電気代', '水道代', 'ガス代', '水道料金', '電気料金', '通信費', '携帯代',
      'スマホ代', 'インターネット代', 'プロバイダ', 'ドコモ', 'ソフトバンク', '東京電力',
      '東京ガス', '公共料金', 'NHK', '振込', 'au携帯', 'au光', 'auショップ'
    ],
    cat_shopping: [
      // English
      'shopping', 'clothing', 'apparel', 'shoes', 'fashion', 'department store', 'mall',
      'boutique', 'uniqlo', 'zara', 'h&m', 'gu', 'gap', 'amazon', 'electronics',
      'bic camera', 'yodobashi', 'furniture', 'ikea', 'nitori', 'apple store',
      'loft', 'tokyu hands', 'store',
      // Japanese
      '買物', 'ショッピング', '衣料', '洋服', 'アパレル', '服飾', '靴', '百貨店',
      'デパート', 'ユニクロ', 'ジーユー', 'ザラ', 'ヨドバシ', 'ビックカメラ',
      'ヤマダ電機', 'ニトリ', '無印良品', 'アップル', 'ロフト', '東急ハンズ', '雑貨', '衣服'
    ],
    cat_entertainment: [
      // English
      'entertainment', 'movie', 'cinema', 'theater', 'theatre', 'concert', 'ticket',
      'game', 'gaming', 'steam', 'playstation', 'nintendo', 'amusement', 'karaoke',
      'bowling', 'museum', 'zoo', 'aquarium', 'disney', 'netflix', 'spotify',
      'toho cinema', 'show',
      // Japanese
      '娯楽', '映画', '映画館', 'シネマ', 'コンサート', 'チケット', 'ゲーム', 'カラオケ',
      'ボウリング', '遊園地', '博物館', '美術館', '水族館', 'ディズニー', 'アミューズメント', 'USJ'
    ],
    cat_health: [
      // English
      'health', 'wellness', 'pharmacy', 'drugstore', 'chemist', 'medicine', 'hospital',
      'clinic', 'doctor', 'dentist', 'optical', 'walgreens', 'cvs', 'boots',
      'matsukiyo', 'welcia', 'sugi', 'tsuruha', 'sundrug',
      // Japanese
      '薬局', 'ドラッグストア', 'ドラッグ', '調剤', '処方箋', '医薬品', '薬品', '病院',
      'クリニック', '医院', '歯科', '歯医者', '眼科', 'マツモトキヨシ', 'マツキヨ',
      'ウエルシア', 'スギ薬局', 'ツルハ', 'サンドラッグ', 'ヘルス', '薬', '風邪薬'
    ],
    cat_personal: [
      // English
      'personal', 'care', 'salon', 'hair', 'barber', 'beauty', 'spa', 'massage',
      'cosmetics', 'nails', 'skincare', 'haircut', 'styling', 'barbershop', 'qb house',
      // Japanese
      'サロン', '美容', '美容室', '美容院', '理容', '床屋', 'ヘアサロン', 'エステ',
      'マッサージ', 'ネイル', 'コスメ', '化粧品', 'ヘアカット', 'カット', '散髪', '理髪', 'QBハウス'
    ],
    cat_education: [
      // English
      'education', 'book', 'books', 'bookstore', 'school', 'tuition', 'course',
      'class', 'training', 'stationery', 'kinokuniya', 'tsutaya', 'maruzen', 'junkudo',
      // Japanese
      '書籍', '本', '本屋', '書店', '文具', '文房具', '教育', '学費', '学校',
      'セミナー', '講座', '紀伊國屋', '蔦屋', 'TSUTAYA', '丸善', 'ジュンク堂'
    ],
    cat_misc: [
      'misc', 'miscellaneous', 'other', 'general', 'その他', '諸経費'
    ]
  };

  const CATEGORY_NAME_ALIASES = {
    cat_groceries: ['groceries', 'grocery', '食料品', 'スーパー'],
    cat_dining: ['dining', 'restaurant', '外食', 'カフェ'],
    cat_transport: ['transport', 'transit', '交通'],
    cat_bills: ['bills', 'utilities', '光熱費'],
    cat_shopping: ['shopping', '買物'],
    cat_entertainment: ['entertainment', '娯楽'],
    cat_health: ['health', 'wellness', '薬局'],
    cat_personal: ['personal', 'サロン'],
    cat_education: ['education', '書籍'],
    cat_misc: ['miscellaneous', 'misc', 'その他']
  };

  const MONTH_MAP = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  // Noise lines to ignore when extracting total amount
  const IGNORE_AMOUNT_LINE_REGEX = /(消費税|内税|外税|内消費税|TAX|VAT|GST|お釣り|釣銭|おつり|\bCHANGE\b)/i;
  // Lines that explicitly mean "Tax Total" or "VAT Total" rather than Grand Total
  const TAX_TOTAL_REGEX = /(TAX\s*TOTAL|TOTAL\s*TAX|VAT\s*TOTAL|TOTAL\s*VAT|消費税(?:等)?合計|消費税額)/i;

  // Grand Total keywords (Tier 1)
  const TIER1_TOTAL_REGEX = /(GRAND\s*TOTAL|TOTAL\s*DUE|AMOUNT\s*DUE|BALANCE\s*DUE|NET\s*AMOUNT|合計|お買上額|お買上げ額|ご請求額|請求金額|現計|\bTOTAL\b)/i;

  // Subtotal / Payment keywords (Tier 2)
  const TIER2_TOTAL_REGEX = /(小計|SUBTOTAL|お支払|支払|PAYMENT|CASH|CARD|CREDIT\s*CARD)/i;

  // Noise regex for merchant extraction
  const TITLE_NOISE_REGEX = /^(?:[*=\-#_\s]*(?:領収書|領収証|レシート|RECEIPT|TAX\s*INVOICE|INVOICE|SALES\s*SLIP|WELCOME(?:\s+TO)?|THANK\s*YOU(?:\s+FOR\s+SHOPPING)?|CUSTOMER\s*RECEIPT|STORE\s*COPY|CUSTOMER\s*COPY|売上票|お買上票)[*=\-#_\s]*)$/i;
  const PHONE_NOISE_REGEX = /(?:TEL|FAX|PHONE|電話|☎)[:.\s]*[\d\-()+\s]{7,}|\b\d{2,4}[-\s]\d{2,4}[-\s]\d{3,4}\b|\(\d{3}\)\s*\d{3}[-\s]\d{4}/i;
  const ADDRESS_NOISE_REGEX = /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県|.{1,5}区|.{1,5}市|.{1,5}町|.{1,5}村|\d+丁目|\d+番地|\b\d+\s+[A-Za-z0-9\s.,]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Hwy|Highway|Way|Dr|Drive|Lane|Ln|Pkwy|Parkway|Court|Ct|Suite|Ste)\b|〒\s*\d{3}-\d{4}|\b\d{5}(?:-\d{4})?\b)/i;
  const URL_NOISE_REGEX = /(?:https?:\/\/|www\.|\.com\b|\.jp\b|\.net\b|\.org\b|@[\w.-]+\.\w+)/i;
  const DATE_TIME_LINE_REGEX = /(?:20\d{2}[年/-]|\d{1,2}[/-]\d{1,2}[/-]20\d{2}|\d{1,2}:\d{2})/;
  const DECORATIVE_ONLY_REGEX = /^[=\-*#_~.\s]{3,}$/;

  /**
   * Cleans raw input text into an array of non-empty trimmed lines.
   * @param {string} text
   * @returns {string[]}
   */
  function cleanLines(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * Helper to format YYYY-MM-DD from numbers.
   */
  function formatDate(year, month, day) {
    const y = String(year).padStart(4, '0');
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Returns today's date formatted as YYYY-MM-DD.
   */
  function getTodayDateString() {
    const now = new Date();
    return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /**
   * Parses monetary number string, handling thousands commas, decimal dots,
   * and European comma decimals (e.g. 18,50 €).
   * @param {string} token
   * @returns {number|null}
   */
  function parseMonetaryToken(token) {
    if (!token) return null;
    let numStr = token;

    if (numStr.includes('.') && numStr.includes(',')) {
      const lastDot = numStr.lastIndexOf('.');
      const lastComma = numStr.lastIndexOf(',');
      if (lastComma > lastDot) {
        // European format: 1.250,50 -> remove dots, replace comma with dot
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else {
        // Standard US format: 1,250.50 -> remove commas
        numStr = numStr.replace(/,/g, '');
      }
    } else if (numStr.includes(',')) {
      const parts = numStr.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // European comma decimal (e.g. 18,50 or 5,5)
        numStr = parts[0] + '.' + parts[1];
      } else {
        // Thousands separator (e.g. 3,480 or 1,000)
        numStr = numStr.replace(/,/g, '');
      }
    } else if (numStr.includes('.')) {
      const parts = numStr.split('.');
      if (parts.length > 2) {
        // Multiple dots used as thousands separators
        numStr = numStr.replace(/\./g, '');
      }
    }

    const val = parseFloat(numStr);
    return isNaN(val) ? null : val;
  }

  /**
   * Extracts monetary amount from a line of text, giving priority to numbers
   * attached to currency symbols (¥, $, €, £, ₱, 円) over generic item counts.
   * @param {string} line
   * @returns {number|null}
   */
  function extractAmountFromLine(line) {
    if (!line) return null;

    // 1. Check for currency prefix: ¥3,480, $45.20, € 18,50
    const prefixMatch = line.match(/(?:¥|￥|\$|€|£|₱|EUR|USD|JPY|GBP|PHP)\s*([0-9][0-9.,]*[0-9]|[0-9])/i);
    if (prefixMatch) {
      const parsed = parseMonetaryToken(prefixMatch[1]);
      if (parsed !== null) return parsed;
    }

    // 2. Check for currency suffix: 1280円, 18,50 €, 45.20 EUR
    const suffixMatch = line.match(/([0-9][0-9.,]*[0-9]|[0-9])\s*(?:円|€|EUR|USD|JPY|GBP|PHP)/i);
    if (suffixMatch) {
      const parsed = parseMonetaryToken(suffixMatch[1]);
      if (parsed !== null) return parsed;
    }

    // 3. Fallback: extract numbers not part of count
    const stripped = line.replace(/\b\d+\s*(?:点|items?|pcs?|個|点数)\b/gi, '')
      .replace(/\b\d+\s*[xX]\s*/g, '');

    const tokens = stripped.match(/\b[0-9][0-9.,]*[0-9]\b|\b[0-9]\b/g);
    if (tokens && tokens.length > 0) {
      for (let i = tokens.length - 1; i >= 0; i--) {
        const parsed = parseMonetaryToken(tokens[i]);
        if (parsed !== null && parsed > 0) return parsed;
      }
    }

    return null;
  }

  /**
   * Normalizes amount based on currency (rounds JPY to whole number, retains 2 decimals for others).
   */
  function normalizeCurrencyAmount(val, defaultCurrency) {
    if (typeof val !== 'number' || isNaN(val)) return 0;
    if (val % 1 === 0) {
      return Math.round(val);
    }
    return Math.round(val * 100) / 100;
  }

  /**
   * Extracts Total Amount from receipt lines.
   * Follows strict keyword prioritization and tax/change line filtering.
   * @param {string[]} lines
   * @param {string} defaultCurrency
   * @returns {{ amount: number, tier: number }}
   */
  function extractTotalAmount(lines, defaultCurrency = 'JPY') {
    if (!lines || lines.length === 0) {
      return { amount: 0, tier: 0 };
    }

    let tier1Candidate = null;
    let tier2Candidate = null;
    let tier3Candidate = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Tax total lines are tax lines, not grand totals
      if (TAX_TOTAL_REGEX.test(line)) {
        continue;
      }

      // Ignore pure tax, change, phone numbers, URLs, and pure date lines
      const isGrandTotalLine = TIER1_TOTAL_REGEX.test(line) && !TAX_TOTAL_REGEX.test(line);
      if (!isGrandTotalLine) {
        if (IGNORE_AMOUNT_LINE_REGEX.test(line) || PHONE_NOISE_REGEX.test(line) || URL_NOISE_REGEX.test(line)) {
          continue;
        }
        if (DATE_TIME_LINE_REGEX.test(line) && !/(?:¥|￥|\$|€|£|₱|円)/.test(line)) {
          continue;
        }
      }

      const amt = extractAmountFromLine(line);
      if (amt === null || amt <= 0) continue;

      // Tier 1: Grand Total keywords
      if (TIER1_TOTAL_REGEX.test(line) && !/(?:SUBTOTAL|小計)/i.test(line)) {
        tier1Candidate = amt;
      }
      // Tier 2: Subtotal / Payment keywords
      else if (TIER2_TOTAL_REGEX.test(line)) {
        tier2Candidate = amt;
      }
      // Tier 3: Lines with explicit currency symbol
      else if (/(?:¥|￥|\$|€|£|₱|円|EUR|USD)/i.test(line)) {
        tier3Candidate = amt;
      }
    }

    if (tier1Candidate !== null) {
      return { amount: normalizeCurrencyAmount(tier1Candidate, defaultCurrency), tier: 1 };
    }
    if (tier2Candidate !== null) {
      return { amount: normalizeCurrencyAmount(tier2Candidate, defaultCurrency), tier: 2 };
    }
    if (tier3Candidate !== null) {
      return { amount: normalizeCurrencyAmount(tier3Candidate, defaultCurrency), tier: 3 };
    }

    // Fallback: Largest currency number found in the lower half of the receipt
    const lowerHalfStartIndex = Math.floor(lines.length / 2);
    let maxFallbackAmount = 0;

    for (let i = lowerHalfStartIndex; i < lines.length; i++) {
      const line = lines[i];
      if (IGNORE_AMOUNT_LINE_REGEX.test(line) || TAX_TOTAL_REGEX.test(line) || PHONE_NOISE_REGEX.test(line) || URL_NOISE_REGEX.test(line)) {
        continue;
      }
      if (DATE_TIME_LINE_REGEX.test(line) && !/(?:¥|￥|\$|€|£|₱|円)/.test(line)) {
        continue;
      }
      const amt = extractAmountFromLine(line);
      if (amt !== null && amt > maxFallbackAmount) {
        maxFallbackAmount = amt;
      }
    }

    if (maxFallbackAmount > 0) {
      return { amount: normalizeCurrencyAmount(maxFallbackAmount, defaultCurrency), tier: 4 };
    }

    // If still nothing, check all lines for any number
    for (let i = lines.length - 1; i >= 0; i--) {
      const amt = extractAmountFromLine(lines[i]);
      if (amt !== null && amt > 0) {
        return { amount: normalizeCurrencyAmount(amt, defaultCurrency), tier: 4 };
      }
    }

    return { amount: 0, tier: 0 };
  }

  /**
   * Extracts Date from receipt lines and normalizes to YYYY-MM-DD.
   * Clamps year between 2000 and currentYear + 1.
   * If not found, falls back to today's date formatted as YYYY-MM-DD.
   * @param {string[]} lines
   * @returns {{ date: string, isExplicit: boolean }}
   */
  function extractReceiptDate(lines) {
    const currentYear = new Date().getFullYear();
    const minYear = 2000;
    const maxYear = currentYear + 1;

    function clampYear(y) {
      return Math.max(minYear, Math.min(maxYear, y));
    }

    if (lines && lines.length > 0) {
      for (const line of lines) {
        // 1. Japanese format: YYYY年MM月DD日 (or YYYY年 M月 D日)
        const jpMatch = line.match(/(\d{4})\s*年\s*([0-1]?\d)\s*月\s*([0-3]?\d)\s*日?/);
        if (jpMatch) {
          const y = clampYear(parseInt(jpMatch[1], 10));
          const m = Math.max(1, Math.min(12, parseInt(jpMatch[2], 10)));
          const d = Math.max(1, Math.min(31, parseInt(jpMatch[3], 10)));
          return { date: formatDate(y, m, d), isExplicit: true };
        }

        // 2. YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD
        const isoMatch = line.match(/\b(\d{4})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
        if (isoMatch) {
          const y = clampYear(parseInt(isoMatch[1], 10));
          const m = parseInt(isoMatch[2], 10);
          const d = parseInt(isoMatch[3], 10);
          return { date: formatDate(y, m, d), isExplicit: true };
        }

        // 3. Text month: 'Oct 28 2026', 'October 28, 2026'
        const textMonthFirst = line.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?\s+([0-3]?\d)(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
        if (textMonthFirst) {
          const monthKey = textMonthFirst[1].toLowerCase();
          const m = MONTH_MAP[monthKey] || 1;
          const d = Math.max(1, Math.min(31, parseInt(textMonthFirst[2], 10)));
          const y = clampYear(parseInt(textMonthFirst[3], 10));
          return { date: formatDate(y, m, d), isExplicit: true };
        }

        // 4. Text month day first: '28 Oct 2026', '28 October 2026'
        const textDayFirst = line.match(/\b([0-3]?\d)(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?,?\s+(\d{4})\b/i);
        if (textDayFirst) {
          const d = Math.max(1, Math.min(31, parseInt(textDayFirst[1], 10)));
          const monthKey = textDayFirst[2].toLowerCase();
          const m = MONTH_MAP[monthKey] || 1;
          const y = clampYear(parseInt(textDayFirst[3], 10));
          return { date: formatDate(y, m, d), isExplicit: true };
        }

        // 5. Slash/Dash formats: MM/DD/YYYY, MM-DD-YYYY, DD/MM/YYYY, DD-MM-YYYY
        const slashMatch = line.match(/\b([0-3]?\d)[-/]([0-3]?\d)[-/](\d{4})\b/);
        if (slashMatch) {
          const p1 = parseInt(slashMatch[1], 10);
          const p2 = parseInt(slashMatch[2], 10);
          const y = clampYear(parseInt(slashMatch[3], 10));

          let m, d;
          if (p1 > 12) {
            // Must be DD/MM/YYYY
            d = Math.max(1, Math.min(31, p1));
            m = Math.max(1, Math.min(12, p2));
          } else if (p2 > 12) {
            // Must be MM/DD/YYYY
            m = Math.max(1, Math.min(12, p1));
            d = Math.max(1, Math.min(31, p2));
          } else {
            // Ambiguous (both <= 12): check for European symbol in line
            if (line.includes('€') || line.includes('EUR')) {
              d = p1;
              m = p2;
            } else {
              m = p1;
              d = p2;
            }
          }
          return { date: formatDate(y, m, d), isExplicit: true };
        }
      }
    }

    // Fallback: today's date formatted as YYYY-MM-DD
    return { date: getTodayDateString(), isExplicit: false };
  }

  /**
   * Extracts Merchant Name from the top 1-4 lines.
   * Strips noise: phone numbers, addresses, URLs, receipt title keywords.
   * Returns cleanest store name (max 40 chars).
   * @param {string[]} lines
   * @returns {string}
   */
  function extractMerchantName(lines) {
    if (!lines || lines.length === 0) return 'Receipt';

    const maxHeaderLines = Math.min(lines.length, 4);

    for (let i = 0; i < maxHeaderLines; i++) {
      let rawLine = lines[i].trim();

      // Skip decorative lines (e.g. '***', '===')
      if (DECORATIVE_ONLY_REGEX.test(rawLine)) continue;

      // Skip receipt title noise lines (e.g. '領収書', '*** RECEIPT ***', 'TAX INVOICE')
      if (TITLE_NOISE_REGEX.test(rawLine)) continue;

      // Skip lines with phone numbers
      if (PHONE_NOISE_REGEX.test(rawLine) && !/(?:cafe|coffee|store|mart|market)/i.test(rawLine)) continue;

      // Skip address lines
      if (ADDRESS_NOISE_REGEX.test(rawLine) && !/(?:cafe|coffee|store|mart|market|セブン|ローソン|イオン)/i.test(rawLine)) continue;

      // Skip URL or email lines
      if (URL_NOISE_REGEX.test(rawLine)) continue;

      // Skip pure date/time lines
      if (DATE_TIME_LINE_REGEX.test(rawLine) && rawLine.length <= 25) continue;

      // Clean prefix noise such as 'WELCOME TO ' or '*** '
      let candidate = rawLine
        .replace(/^[*=\-#_\s]+|[*=\-#_\s]+$/g, '')
        .replace(/^(?:WELCOME\s*TO|THANK\s*YOU\s*FOR\s*VISITING)\s+/i, '')
        .trim();

      // Clean store branch suffixes if present (e.g. "セブン-イレブン 渋谷店" -> "セブン-イレブン", "Trader Joe's #123" -> "Trader Joe's", "ENEOS 渋谷SS" -> "ENEOS")
      candidate = candidate
        .replace(/\s+[\u4e00-\u9faf0-9]+(?:店|支店|劇場|駅前店|前店|SS)$/i, '')
        .replace(/\s+(?:Store|Branch|Shop)?\s*#\s*\d+.*$/i, '')
        .trim();

      if (candidate.length >= 2) {
        return candidate.substring(0, 40).trim();
      }
    }

    // Fallback: first non-empty line trimmed of decorative symbols
    const fallback = lines[0]
      .replace(/^[*=\-#_\s]+|[*=\-#_\s]+$/g, '')
      .trim();

    return (fallback.substring(0, 40) || 'Receipt').trim();
  }

  /**
   * Helper to match keyword in text safely. Uses word boundaries for Latin keywords.
   */
  function matchKeyword(text, kw) {
    if (!text || !kw) return false;
    const isLatin = /^[a-z0-9\s&'-]+$/i.test(kw);
    if (isLatin) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp('\\b' + escaped + '\\b', 'i');
      return reg.test(text);
    }
    return text.toLowerCase().includes(kw.toLowerCase());
  }

  /**
   * Suggests Category using bilingual keyword dictionary matching the 10 default categories.
   * Returns matching category id from `categories`, or defaults to first category.
   * @param {string[]} lines
   * @param {string} merchant
   * @param {Array<{id: string, name: string}>} categories
   * @returns {string}
   */
  function suggestCategory(lines, merchant, categories) {
    const fullText = merchant + ' ' + (lines ? lines.join(' ') : '');
    const merchantText = merchant || '';
    const scores = {};

    // Initialize scores
    for (const catId of Object.keys(CATEGORY_KEYWORDS)) {
      scores[catId] = 0;
    }

    // Score merchant name heavily (weight 5), fullText weight 1
    for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (matchKeyword(merchantText, kw)) {
          scores[catId] += 5;
        } else if (matchKeyword(fullText, kw)) {
          scores[catId] += 1;
        }
      }
    }

    // Find category with highest score
    let bestCatKey = null;
    let highestScore = 0;
    for (const [catId, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        bestCatKey = catId;
      }
    }

    return resolveCategoryId(bestCatKey, categories);
  }

  /**
   * Resolves detected category key against the provided categories array.
   * @param {string|null} detectedKey - e.g. 'cat_groceries'
   * @param {Array<{id: string, name: string}>} categories
   * @returns {string}
   */
  function resolveCategoryId(detectedKey, categories) {
    const defaultCatId = categories && categories.length > 0
      ? (categories[0].id || categories[0])
      : 'cat_groceries';

    if (!detectedKey) {
      return defaultCatId;
    }

    if (!categories || categories.length === 0) {
      return detectedKey;
    }

    // 1. Exact ID match (e.g. 'cat_groceries')
    const exact = categories.find(c => c && c.id === detectedKey);
    if (exact) return exact.id;

    // 2. ID substring match (e.g. 'groceries' in custom ID)
    const shortKey = detectedKey.replace(/^cat_/, '');
    const partialId = categories.find(c => c && c.id && c.id.toLowerCase().includes(shortKey));
    if (partialId) return partialId.id;

    // 3. Name alias match
    const aliases = CATEGORY_NAME_ALIASES[detectedKey] || [shortKey];
    const nameMatch = categories.find(c => {
      if (!c || !c.name) return false;
      const cName = c.name.toLowerCase();
      return aliases.some(alias => cName.includes(alias.toLowerCase()));
    });
    if (nameMatch) return nameMatch.id;

    // Fallback to first category in user list
    return defaultCatId;
  }

  /**
   * Computes confidence score (0.00 to 1.00) based on parsing quality.
   */
  function computeConfidence(amountTier, isExplicitDate, merchant, categoryMatched) {
    let score = 0;

    // Amount extraction score
    if (amountTier === 1) score += 0.45;
    else if (amountTier === 2) score += 0.35;
    else if (amountTier === 3) score += 0.25;
    else if (amountTier === 4) score += 0.15;

    // Date extraction score
    if (isExplicitDate) score += 0.25;
    else score += 0.05;

    // Merchant extraction score
    if (merchant && merchant !== 'Receipt' && merchant !== 'Unknown Merchant') {
      score += 0.20;
    } else {
      score += 0.05;
    }

    // Category match score
    if (categoryMatched) score += 0.10;

    return Math.min(1.0, Math.max(0.1, Math.round(score * 100) / 100));
  }

  /**
   * Main Receipt Parser entry point.
   * Parses raw receipt text into structured transaction fields.
   *
   * @param {string} text - Raw receipt OCR text
   * @param {Array<{id: string, name: string}>} [categories=[]] - Category list for matching
   * @param {string} [defaultCurrency='JPY'] - Default currency code
   * @returns {{
   *   amount: number,
   *   date: string,
   *   merchant: string,
   *   categoryId: string,
   *   confidence: number,
   *   rawLines: string[]
   * }}
   */
  function parseReceiptText(text, categories = [], defaultCurrency = 'JPY') {
    const rawLines = cleanLines(text);

    if (rawLines.length === 0) {
      const today = getTodayDateString();
      const defaultCatId = categories && categories.length > 0
        ? (categories[0].id || categories[0])
        : 'cat_groceries';
      return {
        amount: 0,
        date: today,
        merchant: '',
        categoryId: defaultCatId,
        confidence: 0,
        rawLines: []
      };
    }

    // 1. Extract Total Amount
    const amountResult = extractTotalAmount(rawLines, defaultCurrency);

    // 2. Extract Date (normalizes to YYYY-MM-DD, clamped, fallback to today)
    const dateResult = extractReceiptDate(rawLines);

    // 3. Extract Merchant Name (top 1-4 lines, stripped of noise, max 40 chars)
    const merchant = extractMerchantName(rawLines);

    // 4. Suggest Category
    const categoryId = suggestCategory(rawLines, merchant, categories);
    const hasCategoryMatch = categoryId && (!categories || !categories.length || categoryId !== (categories[0]?.id || categories[0]));

    // 5. Confidence Score
    const confidence = computeConfidence(
      amountResult.tier,
      dateResult.isExplicit,
      merchant,
      hasCategoryMatch
    );

    return {
      amount: amountResult.amount,
      date: dateResult.date,
      merchant,
      categoryId,
      confidence,
      rawLines
    };
  }

  // Bundle namespace
  const ReceiptParser = {
    parseReceiptText,
    extractTotalAmount,
    extractReceiptDate,
    extractMerchantName,
    suggestCategory,
    CATEGORY_KEYWORDS
  };

  // Expose on global environments
  if (typeof window !== 'undefined') {
    window.ReceiptParser = ReceiptParser;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.ReceiptParser = ReceiptParser;
  }
  if (typeof global !== 'undefined') {
    global.ReceiptParser = ReceiptParser;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReceiptParser;
  }

})();

// Localization System - Handles languages, currencies, and translations
const Localization = (() => {
  const DEFAULT_LANGUAGE = "en";
  const DEFAULT_CURRENCY = "CHF";
  const STORAGE_LANGUAGE_KEY = "asm_language";
  const STORAGE_CURRENCY_KEY = "asm_currency";
  const EXCHANGE_RATE_CACHE_KEY = "asm_exchange_rates";
  const EXCHANGE_RATE_CACHE_TTL = 3600000; // 1 hour

  // All supported European and Asian languages
  const LANGUAGES = {
    // European
    en: { name: "English", nativeName: "English", region: "eu" },
    de: { name: "German", nativeName: "Deutsch", region: "eu" },
    fr: { name: "French", nativeName: "Français", region: "eu" },
    it: { name: "Italian", nativeName: "Italiano", region: "eu" },
    es: { name: "Spanish", nativeName: "Español", region: "eu" },
    pt: { name: "Portuguese", nativeName: "Português", region: "eu" },
    nl: { name: "Dutch", nativeName: "Nederlands", region: "eu" },
    pl: { name: "Polish", nativeName: "Polski", region: "eu" },
    el: { name: "Greek", nativeName: "Ελληνικά", region: "eu" },
    cs: { name: "Czech", nativeName: "Čeština", region: "eu" },
    hu: { name: "Hungarian", nativeName: "Magyar", region: "eu" },
    ro: { name: "Romanian", nativeName: "Română", region: "eu" },
    bg: { name: "Bulgarian", nativeName: "Български", region: "eu" },
    hr: { name: "Croatian", nativeName: "Hrvatski", region: "eu" },
    sr: { name: "Serbian", nativeName: "Српски", region: "eu" },
    sv: { name: "Swedish", nativeName: "Svenska", region: "eu" },
    da: { name: "Danish", nativeName: "Dansk", region: "eu" },
    no: { name: "Norwegian", nativeName: "Norsk", region: "eu" },
    fi: { name: "Finnish", nativeName: "Suomi", region: "eu" },
    // Asian
    zh: { name: "Chinese (Simplified)", nativeName: "简体中文", region: "as" },
    "zh-TW": { name: "Chinese (Traditional)", nativeName: "繁體中文", region: "as" },
    ja: { name: "Japanese", nativeName: "日本語", region: "as" },
    ko: { name: "Korean", nativeName: "한국어", region: "as" },
    hi: { name: "Hindi", nativeName: "हिन्दी", region: "as" },
    th: { name: "Thai", nativeName: "ไทย", region: "as" },
    vi: { name: "Vietnamese", nativeName: "Tiếng Việt", region: "as" },
    id: { name: "Indonesian", nativeName: "Bahasa Indonesia", region: "as" },
    tl: { name: "Filipino", nativeName: "Tagalog", region: "as" },
    bn: { name: "Bengali", nativeName: "বাংলা", region: "as" },
    my: { name: "Burmese", nativeName: "မြန်မာ", region: "as" },
    km: { name: "Khmer", nativeName: "ខ្មែរ", region: "as" },
  };

  // All supported European and Asian currencies
  const CURRENCIES = {
    // European
    EUR: { name: "Euro", symbol: "€", region: "eu" },
    CHF: { name: "Swiss Franc", symbol: "CHF", region: "eu" },
    GBP: { name: "British Pound", symbol: "£", region: "eu" },
    NOK: { name: "Norwegian Krone", symbol: "kr", region: "eu" },
    SEK: { name: "Swedish Krona", symbol: "kr", region: "eu" },
    DKK: { name: "Danish Krone", symbol: "kr", region: "eu" },
    CZK: { name: "Czech Koruna", symbol: "Kč", region: "eu" },
    HUF: { name: "Hungarian Forint", symbol: "Ft", region: "eu" },
    RON: { name: "Romanian Leu", symbol: "lei", region: "eu" },
    BGN: { name: "Bulgarian Lev", symbol: "лв", region: "eu" },
    HRK: { name: "Croatian Kuna", symbol: "kn", region: "eu" },
    PLN: { name: "Polish Zloty", symbol: "zł", region: "eu" },
    // Asian
    CNY: { name: "Chinese Yuan", symbol: "¥", region: "as" },
    JPY: { name: "Japanese Yen", symbol: "¥", region: "as" },
    KRW: { name: "South Korean Won", symbol: "₩", region: "as" },
    INR: { name: "Indian Rupee", symbol: "₹", region: "as" },
    THB: { name: "Thai Baht", symbol: "฿", region: "as" },
    IDR: { name: "Indonesian Rupiah", symbol: "Rp", region: "as" },
    VND: { name: "Vietnamese Dong", symbol: "₫", region: "as" },
    PHP: { name: "Philippine Peso", symbol: "₱", region: "as" },
    MYR: { name: "Malaysian Ringgit", symbol: "RM", region: "as" },
    SGD: { name: "Singapore Dollar", symbol: "S$", region: "as" },
    HKD: { name: "Hong Kong Dollar", symbol: "HK$", region: "as" },
    TWD: { name: "Taiwan Dollar", symbol: "NT$", region: "as" },
    PKR: { name: "Pakistani Rupee", symbol: "₨", region: "as" },
    BDT: { name: "Bangladeshi Taka", symbol: "৳", region: "as" },
  };

  // Translation strings for UI elements
  const TRANSLATIONS = {
    en: {
      "language": "Language",
      "currency": "Currency",
      "home": "Home",
      "catalog": "Catalog",
      "sell": "Sell",
      "about": "About",
      "contact": "Contact",
      "search": "Search designer or piece...",
      "help": "Help",
      "account": "Account",
      "create-account": "Create Account",
      "my-account": "My Account",
      "moderation": "Moderation",
      "exclusive-offers": "Exclusive Offers",
      "exclusive-offers-desc": "Get exclusive offers and early access to new pieces",
      "about-archive": "About Archive",
      "warehouse": "Warehouse",
      "authenticity": "Authenticity",
      "customer-care": "Customer Care",
      "help-support": "Help & Support",
      "create-account-link": "Create Account",
      "legal": "Legal",
      "privacy-policy": "Privacy Policy",
      "terms": "Terms",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "Subscribe",
    },
    de: {
      "language": "Sprache",
      "currency": "Währung",
      "home": "Startseite",
      "catalog": "Katalog",
      "sell": "Verkaufen",
      "about": "Über",
      "contact": "Kontakt",
      "search": "Designer oder Stück suchen...",
      "help": "Hilfe",
      "account": "Konto",
      "create-account": "Konto erstellen",
      "my-account": "Mein Konto",
      "moderation": "Moderation",
      "exclusive-offers": "Exklusive Angebote",
      "exclusive-offers-desc": "Erhalten Sie exklusive Angebote und frühen Zugang zu neuen Stücken",
      "about-archive": "Über Archive",
      "warehouse": "Warehouse",
      "authenticity": "Authentizität",
      "customer-care": "Kundenbetreuung",
      "help-support": "Hilfe & Support",
      "create-account-link": "Konto erstellen",
      "legal": "Rechtliches",
      "privacy-policy": "Datenschutzrichtlinie",
      "terms": "Bedingungen",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "Abonnieren",
    },
    fr: {
      "language": "Langue",
      "currency": "Devise",
      "home": "Accueil",
      "catalog": "Catalogue",
      "sell": "Vendre",
      "about": "À propos",
      "contact": "Contact",
      "search": "Rechercher un designer ou une pièce...",
      "help": "Aide",
      "account": "Compte",
      "create-account": "Créer un compte",
      "my-account": "Mon compte",
      "moderation": "Modération",
      "exclusive-offers": "Offres exclusives",
      "exclusive-offers-desc": "Obtenez des offres exclusives et un accès anticipé aux nouvelles pièces",
      "about-archive": "À propos d'Archive",
      "warehouse": "Entrepôt",
      "authenticity": "Authenticité",
      "customer-care": "Service client",
      "help-support": "Aide et support",
      "create-account-link": "Créer un compte",
      "legal": "Mentions légales",
      "privacy-policy": "Politique de confidentialité",
      "terms": "Conditions",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "S'abonner",
    },
    it: {
      "language": "Lingua",
      "currency": "Valuta",
      "home": "Home",
      "catalog": "Catalogo",
      "sell": "Vendi",
      "about": "Chi siamo",
      "contact": "Contatti",
      "search": "Cerca designer o capo...",
      "help": "Aiuto",
      "account": "Account",
      "create-account": "Crea account",
      "my-account": "Il mio account",
      "moderation": "Moderazione",
      "exclusive-offers": "Offerte esclusive",
      "exclusive-offers-desc": "Ottieni offerte esclusive e accesso anticipato ai nuovi articoli",
      "about-archive": "Chi siamo",
      "warehouse": "Magazzino",
      "authenticity": "Autenticità",
      "customer-care": "Servizio clienti",
      "help-support": "Aiuto e supporto",
      "create-account-link": "Crea account",
      "legal": "Note legali",
      "privacy-policy": "Informativa sulla privacy",
      "terms": "Termini",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "Iscriviti",
    },
    es: {
      "language": "Idioma",
      "currency": "Moneda",
      "home": "Inicio",
      "catalog": "Catálogo",
      "sell": "Vender",
      "about": "Acerca de",
      "contact": "Contacto",
      "search": "Buscar diseñador o pieza...",
      "help": "Ayuda",
      "account": "Cuenta",
      "create-account": "Crear cuenta",
      "my-account": "Mi cuenta",
      "moderation": "Moderación",
      "exclusive-offers": "Ofertas exclusivas",
      "exclusive-offers-desc": "Obtén ofertas exclusivas y acceso anticipado a nuevas piezas",
      "about-archive": "Acerca de Archive",
      "warehouse": "Almacén",
      "authenticity": "Autenticidad",
      "customer-care": "Atención al cliente",
      "help-support": "Ayuda y soporte",
      "create-account-link": "Crear cuenta",
      "legal": "Legal",
      "privacy-policy": "Política de privacidad",
      "terms": "Términos",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "Suscribirse",
    },
    ja: {
      "language": "言語",
      "currency": "通貨",
      "home": "ホーム",
      "catalog": "カタログ",
      "sell": "売却",
      "about": "について",
      "contact": "お問い合わせ",
      "search": "デザイナーまたはピースを検索...",
      "help": "ヘルプ",
      "account": "アカウント",
      "create-account": "アカウントを作成",
      "my-account": "マイアカウント",
      "moderation": "モデレーション",
      "exclusive-offers": "限定オファー",
      "exclusive-offers-desc": "限定オファーと新しいピースへのアーリーアクセスを取得",
      "about-archive": "アーカイブについて",
      "warehouse": "ウェアハウス",
      "authenticity": "真正性",
      "customer-care": "カスタマーケア",
      "help-support": "ヘルプとサポート",
      "create-account-link": "アカウントを作成",
      "legal": "法務",
      "privacy-policy": "プライバシーポリシー",
      "terms": "利用規約",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "購読",
    },
    zh: {
      "language": "语言",
      "currency": "货币",
      "home": "主页",
      "catalog": "目录",
      "sell": "出售",
      "about": "关于",
      "contact": "联系",
      "search": "搜索设计师或作品...",
      "help": "帮助",
      "account": "账户",
      "create-account": "创建账户",
      "my-account": "我的账户",
      "moderation": "审核",
      "exclusive-offers": "专享优惠",
      "exclusive-offers-desc": "获取专享优惠和新作品的提前访问权",
      "about-archive": "关于 Archive",
      "warehouse": "仓库",
      "authenticity": "真伪鉴别",
      "customer-care": "客户服务",
      "help-support": "帮助和支持",
      "create-account-link": "创建账户",
      "legal": "法律",
      "privacy-policy": "隐私政策",
      "terms": "条款",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "订阅",
    },
    ko: {
      "language": "언어",
      "currency": "통화",
      "home": "홈",
      "catalog": "카탈로그",
      "sell": "판매",
      "about": "정보",
      "contact": "연락처",
      "search": "디자이너 또는 상품 검색...",
      "help": "도움말",
      "account": "계정",
      "create-account": "계정 만들기",
      "my-account": "내 계정",
      "moderation": "중재",
      "exclusive-offers": "독점 오퍼",
      "exclusive-offers-desc": "독점 오퍼 및 신상품 조기 액세스 받기",
      "about-archive": "Archive 정보",
      "warehouse": "창고",
      "authenticity": "진정성",
      "customer-care": "고객 서비스",
      "help-support": "도움말 및 지원",
      "create-account-link": "계정 만들기",
      "legal": "법률",
      "privacy-policy": "개인정보 보호정책",
      "terms": "약관",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "구독",
    },
    pt: {
      "language": "Idioma",
      "currency": "Moeda",
      "home": "Início",
      "catalog": "Catálogo",
      "sell": "Vender",
      "about": "Sobre",
      "contact": "Contato",
      "search": "Pesquisar designer ou peça...",
      "help": "Ajuda",
      "account": "Conta",
      "create-account": "Criar conta",
      "my-account": "Minha conta",
      "moderation": "Moderação",
      "exclusive-offers": "Ofertas exclusivas",
      "exclusive-offers-desc": "Obtenha ofertas exclusivas e acesso antecipado a novas peças",
      "about-archive": "Sobre Archive",
      "warehouse": "Armazém",
      "authenticity": "Autenticidade",
      "customer-care": "Atendimento ao cliente",
      "help-support": "Ajuda e suporte",
      "create-account-link": "Criar conta",
      "legal": "Legal",
      "privacy-policy": "Política de Privacidade",
      "terms": "Termos",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "Inscrever-se",
    },
    nl: {
      "language": "Taal",
      "currency": "Valuta",
      "home": "Home",
      "catalog": "Catalogus",
      "sell": "Verkopen",
      "about": "Over",
      "contact": "Contact",
      "search": "Ontwerper of item zoeken...",
      "help": "Hulp",
      "account": "Account",
      "create-account": "Account aanmaken",
      "my-account": "Mijn account",
      "moderation": "Moderatie",
      "exclusive-offers": "Exclusieve aanbiedingen",
      "exclusive-offers-desc": "Ontvang exclusieve aanbiedingen en vroege toegang tot nieuwe items",
      "about-archive": "Over Archive",
      "warehouse": "Magazijn",
      "authenticity": "Authenticiteit",
      "customer-care": "Klantenservice",
      "help-support": "Hulp en ondersteuning",
      "create-account-link": "Account aanmaken",
      "legal": "Juridisch",
      "privacy-policy": "Privacybeleid",
      "terms": "Voorwaarden",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "Abonneren",
    },
    pl: {
      "language": "Język",
      "currency": "Waluta",
      "home": "Strona główna",
      "catalog": "Katalog",
      "sell": "Sprzedaj",
      "about": "O nas",
      "contact": "Kontakt",
      "search": "Wyszukaj projektanta lub sztukę...",
      "help": "Pomoc",
      "account": "Konto",
      "create-account": "Utwórz konto",
      "my-account": "Moje konto",
      "moderation": "Moderacja",
      "exclusive-offers": "Oferty ekskluzywne",
      "exclusive-offers-desc": "Otrzymaj oferty ekskluzywne i wczesny dostęp do nowych sztuk",
      "about-archive": "O Archive",
      "warehouse": "Magazyn",
      "authenticity": "Autentyczność",
      "customer-care": "Obsługa klienta",
      "help-support": "Pomoc i wsparcie",
      "create-account-link": "Utwórz konto",
      "legal": "Prawne",
      "privacy-policy": "Polityka prywatności",
      "terms": "Warunki",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "Subskrybuj",
    },
    th: {
      "language": "ภาษา",
      "currency": "สกุลเงิน",
      "home": "หน้าแรก",
      "catalog": "แคตตาล็อก",
      "sell": "ขาย",
      "about": "เกี่ยวกับ",
      "contact": "ติดต่อ",
      "search": "ค้นหาดีไซเนอร์หรือชิ้น...",
      "help": "ช่วยเหลือ",
      "account": "บัญชี",
      "create-account": "สร้างบัญชี",
      "my-account": "บัญชีของฉัน",
      "moderation": "การปรับแต่ง",
      "exclusive-offers": "ข้อเสนอพิเศษ",
      "exclusive-offers-desc": "รับข้อเสนอพิเศษและการเข้าถึงก่อนใครสำหรับชิ้นใหม่",
      "about-archive": "เกี่ยวกับ Archive",
      "warehouse": "คลังสินค้า",
      "authenticity": "ความถูกต้อง",
      "customer-care": "บริการลูกค้า",
      "help-support": "ช่วยเหลือและสนับสนุน",
      "create-account-link": "สร้างบัญชี",
      "legal": "ทางกฎหมาย",
      "privacy-policy": "นโยบายความเป็นส่วนตัว",
      "terms": "เงื่อนไข",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "สมัครสมาชิก",
    },
    vi: {
      "language": "Ngôn ngữ",
      "currency": "Tiền tệ",
      "home": "Trang chủ",
      "catalog": "Danh mục",
      "sell": "Bán",
      "about": "Giới thiệu",
      "contact": "Liên hệ",
      "search": "Tìm kiếm nhà thiết kế hoặc sản phẩm...",
      "help": "Trợ giúp",
      "account": "Tài khoản",
      "create-account": "Tạo tài khoản",
      "my-account": "Tài khoản của tôi",
      "moderation": "Kiểm duyệt",
      "exclusive-offers": "Ưu đãi độc quyền",
      "exclusive-offers-desc": "Nhận ưu đãi độc quyền và truy cập sớm vào những sản phẩm mới",
      "about-archive": "Giới thiệu Archive",
      "warehouse": "Kho hàng",
      "authenticity": "Tính xác thực",
      "customer-care": "Chăm sóc khách hàng",
      "help-support": "Trợ giúp và hỗ trợ",
      "create-account-link": "Tạo tài khoản",
      "legal": "Pháp lý",
      "privacy-policy": "Chính sách bảo mật",
      "terms": "Điều khoản",
      "copyright": "© 2026 Archive-sur-Mer Marketplace",
      "subscribe": "Đăng ký",
    },
  };

  let currentLanguage = DEFAULT_LANGUAGE;
  let currentCurrency = DEFAULT_CURRENCY;
  let exchangeRates = {};

  // Initialize from localStorage
  function init() {
    const savedLang = localStorage.getItem(STORAGE_LANGUAGE_KEY);
    const savedCur = localStorage.getItem(STORAGE_CURRENCY_KEY);

    if (savedLang && LANGUAGES[savedLang]) currentLanguage = savedLang;
    if (savedCur && CURRENCIES[savedCur]) currentCurrency = savedCur;

    loadExchangeRates();
  }

  // Fetch exchange rates from a free API
  async function loadExchangeRates() {
    const cached = localStorage.getItem(EXCHANGE_RATE_CACHE_KEY);
    const cacheTime = localStorage.getItem(EXCHANGE_RATE_CACHE_KEY + "_time");

    if (cached && cacheTime && Date.now() - parseInt(cacheTime) < EXCHANGE_RATE_CACHE_TTL) {
      exchangeRates = JSON.parse(cached);
      return;
    }

    try {
      // Using exchangerate-api.com free tier (1,500 requests/month)
      const response = await fetch("https://open.er-api.com/v6/latest/EUR");
      const data = await response.json();

      if (data.rates) {
        exchangeRates = data.rates;
        localStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify(exchangeRates));
        localStorage.setItem(EXCHANGE_RATE_CACHE_KEY + "_time", Date.now().toString());
      }
    } catch (error) {
      console.error("Failed to fetch exchange rates:", error);
      // Use fallback rates if API fails
      exchangeRates = getFallbackExchangeRates();
    }
  }

  // Fallback exchange rates (in case API is unavailable)
  function getFallbackExchangeRates() {
    return {
      EUR: 1,
      CHF: 0.95,
      GBP: 0.86,
      NOK: 11.2,
      SEK: 11.5,
      DKK: 7.45,
      CZK: 24.5,
      HUF: 380,
      RON: 4.95,
      BGN: 1.96,
      HRK: 7.5,
      PLN: 4.25,
      CNY: 7.9,
      JPY: 160,
      KRW: 1400,
      INR: 89,
      THB: 37,
      IDR: 16500,
      VND: 25500,
      PHP: 60,
      MYR: 4.8,
      SGD: 1.4,
      HKD: 8.5,
      TWD: 33,
      PKR: 280,
      BDT: 110,
    };
  }

  // Get translation string
  function t(key, fallback = key) {
    const langStrings = TRANSLATIONS[currentLanguage] || TRANSLATIONS[DEFAULT_LANGUAGE];
    return langStrings[key] || fallback;
  }

  // Convert price between currencies
  function convertPrice(price, fromCurrency = "EUR") {
    if (!exchangeRates[fromCurrency] || !exchangeRates[currentCurrency]) {
      return price;
    }

    const eurPrice = price / (exchangeRates[fromCurrency] || 1);
    const convertedPrice = eurPrice * (exchangeRates[currentCurrency] || 1);
    return Math.round(convertedPrice * 100) / 100;
  }

  // Format price with current currency
  function formatPrice(price, currencyOverride = null) {
    const currency = currencyOverride || currentCurrency;
    const currencyInfo = CURRENCIES[currency];

    if (!currencyInfo) return `${price} ${currency}`;

    // Format based on currency symbol position and decimal places
    const formatted = price.toFixed(2);
    const symbol = currencyInfo.symbol;

    // Most European currencies use symbol after number, some use before
    if (["EUR", "CHF"].includes(currency)) {
      return `${formatted} ${symbol}`;
    }
    return `${symbol}${formatted}`;
  }

  // Set language
  function setLanguage(langCode) {
    if (LANGUAGES[langCode]) {
      currentLanguage = langCode;
      localStorage.setItem(STORAGE_LANGUAGE_KEY, langCode);
      updateDOM();
      return true;
    }
    return false;
  }

  // Set currency
  function setCurrency(currencyCode) {
    if (CURRENCIES[currencyCode]) {
      currentCurrency = currencyCode;
      localStorage.setItem(STORAGE_CURRENCY_KEY, currencyCode);
      updateDOM();
      return true;
    }
    return false;
  }

  // Update all elements with data-i18n attributes
  function updateDOM() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) {
        el.textContent = t(key);
      }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) {
        el.placeholder = t(key);
      }
    });

    // Dispatch custom event for price updates
    document.dispatchEvent(new CustomEvent("localizationChanged"));
  }

  // Get current language and currency
  function getLanguage() {
    return currentLanguage;
  }

  function getCurrency() {
    return currentCurrency;
  }

  // Get all languages and currencies for dropdown generation
  function getLanguages() {
    return LANGUAGES;
  }

  function getCurrencies() {
    return CURRENCIES;
  }

  // Public API
  return {
    init,
    t,
    convertPrice,
    formatPrice,
    setLanguage,
    setCurrency,
    getLanguage,
    getCurrency,
    getLanguages,
    getCurrencies,
    loadExchangeRates,
  };
})();

// Initialize on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Localization.init());
} else {
  Localization.init();
}

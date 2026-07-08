"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Sparkles,
  Shield,
  Zap,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Brain,
  MessageCircleQuestion,
  ChevronDown,
  Globe,
  Bot,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

const FAQS = [
  {
    questionEn: "How does the AI scheduling work?",
    answerEn: "Our natural language processing engine parses your input (e.g., 'Lunch tomorrow at 12pm') and automatically extracts the date, time, and intent to create a calendar event.",
    questionId: "Bagaimana cara kerja penjadwalan AI?",
    answerId: "Mesin pemrosesan bahasa alami kami mem-parsing input Anda (misal, 'Makan siang besok jam 12') dan otomatis mengekstrak tanggal, waktu, serta niat untuk membuat event kalender."
  },
  {
    questionEn: "Does Timeora detect scheduling conflicts?",
    answerEn: "Yes! Timeora cross-references your existing calendar and alerts you immediately if there's a double booking, suggesting the next available slot.",
    questionId: "Apakah Timeora mendeteksi jadwal bentrok?",
    answerId: "Tentu! Timeora memeriksa silang kalender Anda dan langsung memberi peringatan jika ada jadwal ganda, serta menyarankan slot berikutnya yang kosong."
  },
  {
    questionEn: "Can I use Timeora in Indonesian?",
    answerEn: "Absolutely. Our AI is trained to understand both English and Indonesian seamlessly, so you can type just like you'd chat with a colleague.",
    questionId: "Bisa pakai bahasa Indonesia?",
    answerId: "Pasti. AI kami dilatih untuk memahami bahasa Inggris dan Indonesia dengan mulus, sehingga Anda bisa mengetik layaknya sedang chat dengan rekan kerja."
  },
  {
    questionEn: "Is Timeora free to use?",
    answerEn: "Currently, Timeora is in beta and completely free for early adopters. We plan to introduce premium team features in the future.",
    questionId: "Apakah Timeora gratis digunakan?",
    answerId: "Saat ini, Timeora berstatus beta dan gratis sepenuhnya untuk pengguna awal. Kami berencana merilis fitur tim premium di masa mendatang."
  },
  {
    questionEn: "Does it support rescheduling and canceling?",
    answerEn: "Yes. Just type natural commands like 'Reschedule my meeting with Ari to Friday' or 'Cancel the 10am standup' and Timeora handles it with conflict checking.",
    questionId: "Bisa reschedule dan cancel lewat AI?",
    answerId: "Bisa. Ketik perintah natural seperti 'Pindahkan meeting dengan Ari ke Jumat' atau 'Batalkan standup jam 10' — Timeora akan memproses dengan pengecekan bentrok."
  },
  {
    questionEn: "How is Timeora different from Calendly or Reclaim?",
    answerEn: "Timeora focuses on natural language in two languages + a fully interactive drag & resize calendar with instant smart alternatives — not just booking links or pure auto-blocking.",
    questionId: "Apa bedanya dengan Calendly atau Reclaim?",
    answerId: "Timeora fokus pada bahasa natural dua bahasa + kalender interaktif drag & resize dengan saran alternatif pintar — bukan hanya link booking atau auto-blocking penuh."
  }
];

const content = {
  en: {
    signIn: "Sign In",
    getStarted: "Get Started",
    heroBadge: "Only Bilingual AI Scheduler • EN + ID",
    heroTitlePrefix: "Schedule in ",
    heroTitleHighlight: "English or Indonesian",
    heroDescStart: "Just type naturally — ",
    heroDescCode: '"Meeting dengan tim besok jam 10 pagi"',
    heroDescEnd: " — Timeora understands both languages perfectly, detects conflicts instantly, and suggests better times.",
    heroCtaFree: "Start Scheduling Free",
    heroCtaGithub: "View on GitHub",
    socialProof: "Trusted by 500+ professionals in Indonesia & globally",
    trustLine: "Free during beta • No credit card • Works in both languages",
    featuresSectionTitleStart: "Everything you need to ",
    featuresSectionTitleHighlight: "own your time",
    featuresSectionSub: "Three powerful features seamlessly integrated into one premium experience.",
    bilingualAdvantageTitle: "Built for Indonesia & the world",
    bilingualAdvantageDesc: "The only scheduling tool that truly understands natural Indonesian and English. Switch languages instantly. No translation needed.",
    features: [
      {
        title: "Bilingual AI Parser",
        desc: "Type naturally in English or Indonesian. Our AI instantly understands context, parses dates, and sets up participants without forms."
      },
      {
        title: "Assistant Actions & ICS",
        desc: "More than a calendar. Execute assistant actions in real-time, handle ICS import/exports seamlessly, and track smart analytics."
      },
      {
        title: "Smart Conflict Resolution",
        desc: "Automatically catches double bookings and suggests instant alternative slots. Verified and tested via the TestSprite loop."
      }
    ],
    howItWorksTitle: "How it works",
    howItWorksSub: "Three steps. Zero friction. Pure productivity.",
    steps: [
      { title: "Type in natural language", desc: 'Open the Command Bar (⌘K) and type something like "Lunch meeting with Ari next Tuesday at noon for 1 hour" or in Indonesian.' },
      { title: "AI parses & checks conflicts", desc: "Our AI extracts the structured event data and checks against your existing schedule in real-time — in either language." },
      { title: "Confirm & done", desc: "Review the pre-filled event form, tweak if needed, hit save. Your event appears on the calendar instantly." }
    ],
    faqTitle: "Frequently Asked Questions",
    faqSub: "Everything you need to know about Timeora.",
    ctaTitle: "Ready to reclaim your time?",
    ctaSub: "Join Timeora and start scheduling smarter — powered by AI, designed for modern professionals who speak English or Indonesian.",
    ctaButton: "Get Started for Free",
    integrationsTitle: "Works with the tools you already use",
    integrationsSub: "Seamless sync with your calendars and favorite apps.",
    trustTitle: "Trusted & Secure",
    trustItems: [
      "Free during beta",
      "No credit card required",
      "Data stays private",
      "Google & Outlook Calendar",
      "No AI training on your data"
    ]
  },
  id: {
    signIn: "Masuk",
    getStarted: "Mulai",
    heroBadge: "Satu-satunya Scheduler AI Dwibahasa • EN + ID",
    heroTitlePrefix: "Jadwalkan dalam ",
    heroTitleHighlight: "Bahasa Inggris atau Indonesia",
    heroDescStart: "Ketik secara natural — ",
    heroDescCode: '"Meeting dengan tim besok jam 10 pagi"',
    heroDescEnd: " — Timeora memahami kedua bahasa dengan sempurna, langsung mendeteksi bentrok, dan menyarankan waktu yang lebih baik.",
    heroCtaFree: "Jadwalkan Gratis",
    heroCtaGithub: "Lihat di GitHub",
    socialProof: "Dipercaya oleh 500+ profesional di Indonesia & global",
    trustLine: "Gratis selama beta • Tanpa kartu kredit • Bekerja di dua bahasa",
    featuresSectionTitleStart: "Semua yang Anda butuhkan untuk ",
    featuresSectionTitleHighlight: "menguasai waktu",
    featuresSectionSub: "Tiga fitur tangguh yang terintegrasi mulus dalam satu pengalaman premium.",
    bilingualAdvantageTitle: "Dibuat untuk Indonesia & dunia",
    bilingualAdvantageDesc: "Satu-satunya alat penjadwalan yang benar-benar memahami bahasa Indonesia dan Inggris secara natural. Ganti bahasa kapan saja. Tanpa perlu terjemahan.",
    features: [
      {
        title: "Parser AI Dwibahasa",
        desc: "Ketik secara natural dalam bahasa Inggris atau Indonesia. AI kami langsung memahami konteks, parsing tanggal, dan mengatur peserta tanpa form."
      },
      {
        title: "Asisten Aksi & ICS",
        desc: "Lebih dari sekadar kalender. Eksekusi aksi asisten secara real-time, tangani ekspor/impor ICS dengan mulus, dan pantau analitik pintar."
      },
      {
        title: "Resolusi Bentrok Pintar",
        desc: "Otomatis mendeteksi jadwal ganda dan menyarankan slot alternatif seketika. Terverifikasi dan diuji melalui sistem TestSprite."
      }
    ],
    howItWorksTitle: "Cara kerjanya",
    howItWorksSub: "Tiga langkah. Tanpa hambatan. Murni produktivitas.",
    steps: [
      { title: "Ketik dengan bahasa natural", desc: 'Buka Command Bar (⌘K) dan ketik sesuatu seperti "Meeting makan siang dengan Ari Selasa depan siang selama 1 jam" atau dalam bahasa Inggris.' },
      { title: "AI mem-parsing & cek bentrok", desc: "AI kami mengekstrak data event terstruktur dan memeriksa jadwal Anda secara real-time — dalam bahasa apa pun." },
      { title: "Konfirmasi & selesai", desc: "Tinjau form event yang terisi otomatis, sesuaikan jika perlu, lalu simpan. Event langsung muncul di kalender." }
    ],
    faqTitle: "Pertanyaan Seputar Timeora",
    faqSub: "Semua yang perlu Anda ketahui tentang Timeora.",
    ctaTitle: "Siap merebut kembali waktu Anda?",
    ctaSub: "Bergabung dengan Timeora dan jadwalkan lebih cerdas — ditenagai AI, dirancang untuk profesional modern yang berbicara Inggris atau Indonesia.",
    ctaButton: "Mulai Secara Gratis",
    integrationsTitle: "Terhubung dengan tools yang sudah Anda pakai",
    integrationsSub: "Sinkronisasi mulus dengan kalender dan aplikasi favorit Anda.",
    trustTitle: "Terpercaya & Aman",
    trustItems: [
      "Gratis selama beta",
      "Tanpa kartu kredit",
      "Data tetap privat",
      "Google & Outlook Calendar",
      "AI tidak melatih data Anda"
    ]
  }
};

const typewriterPhrases = [
  '"Meeting dengan tim besok jam 10 pagi"',
  '"Lunch with client next Friday at 1pm"',
  '"Review sprint mingguan tiap rabu"'
];

export default function LandingPage() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [scrollYValue, setScrollYValue] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [lang, setLang] = useState<'en' | 'id'>('en');
  const [demoInput, setDemoInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [demoMode, setDemoMode] = useState<'create' | 'reschedule'>('create');

  // Enhanced demo state
  const [dynamicEvent, setDynamicEvent] = useState<{ dayIndex: number, title: string, isConflict: boolean, time?: string, duration?: string } | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [alternatives, setAlternatives] = useState<Array<{ dayIndex: number; time: string; label: string }>>([]);
  const [selectedAltIndex, setSelectedAltIndex] = useState<number | null>(null);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  // Typewriter states
  const [currentPhraseIdx, setCurrentPhraseIdx] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { scrollY } = useScroll();
  const backgroundY = useTransform(scrollY, [0, 1000], ["0px", "200px"]);

  const t = content[lang];

  useEffect(() => {
    if (!demoInput.trim()) {
      setDynamicEvent(null);
      setParsedData(null);
      setAlternatives([]);
      setAppliedMessage(null);
      setIsParsing(false);
      return;
    }
    setIsParsing(true);
    setAppliedMessage(null);
    setSelectedAltIndex(null);

    const timer = setTimeout(() => {
      const text = demoInput.toLowerCase();
      let dayIndex = 2;
      let title = demoMode === 'reschedule' ? "Rescheduled Meeting" : "New Event";
      let time = "10:00";
      let duration = "1 hour";

      // Day detection (improved)
      if (text.includes("senin") || text.includes("mon")) dayIndex = 0;
      else if (text.includes("selasa") || text.includes("tue")) dayIndex = 1;
      else if (text.includes("rabu") || text.includes("wed")) dayIndex = 2;
      else if (text.includes("kamis") || text.includes("thu")) dayIndex = 3;
      else if (text.includes("jumat") || text.includes("fri")) dayIndex = 4;
      else if (text.includes("sabtu") || text.includes("sat")) dayIndex = 5;
      else if (text.includes("minggu") || text.includes("sun")) dayIndex = 6;
      else if (text.includes("besok") || text.includes("tomorrow")) dayIndex = (new Date().getDay() + 6) % 7;

      // Basic title extraction
      const words = demoInput.split(" ");
      title = words.slice(0, 5).join(" ").replace(/\b(di|jam|hari|besok|pada|pukul|selama|meeting|rapat|with|dengan)\b/gi, '').trim() || title;

      // Time hints
      if (text.includes("10") || text.includes("pagi")) time = "10:00";
      else if (text.includes("14") || text.includes("2pm")) time = "14:00";
      else if (text.includes("jam 9") || text.includes("9am")) time = "09:00";

      if (text.includes("45") || text.includes("menit")) duration = "45 min";
      else if (text.includes("2 jam")) duration = "2 hours";

      const staticDays = [1, 3, 4];
      const isConflict = staticDays.includes(dayIndex);

      const newDynamic = { dayIndex, title, isConflict, time, duration };
      setDynamicEvent(newDynamic);

      // Structured parsed output
      setParsedData({
        title,
        day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dayIndex],
        time,
        duration,
        intent: demoMode === 'reschedule' ? "Reschedule" : "Create",
        language: /[\u00C0-\u017F\u1E00-\u1EFF]/.test(demoInput) || text.includes("besok") || text.includes("jam") ? "Indonesian" : "English"
      });

      // Generate 3 alternative slots (smart suggestions)
      const altDays = [dayIndex, (dayIndex + 1) % 7, (dayIndex + 2) % 7];
      const alts = altDays.map((d, idx) => ({
        dayIndex: d,
        time: idx === 0 ? "11:00" : idx === 1 ? "15:30" : "09:30",
        label: `${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d]} ${idx === 0 ? "11:00" : idx === 1 ? "15:30" : "09:30"}`
      }));
      setAlternatives(alts);

      setIsParsing(false);
    }, 650);

    return () => clearTimeout(timer);
  }, [demoInput, demoMode]);

  useEffect(() => {
    const currentPhrase = typewriterPhrases[currentPhraseIdx];
    const typingSpeed = isDeleting ? 30 : 70;
    
    const timer = setTimeout(() => {
      if (!isDeleting && typedText === currentPhrase) {
        setTimeout(() => setIsDeleting(true), 2000);
      } else if (isDeleting && typedText === "") {
        setIsDeleting(false);
        setCurrentPhraseIdx((prev) => (prev + 1) % typewriterPhrases.length);
      } else {
        setTypedText(currentPhrase.substring(0, typedText.length + (isDeleting ? -1 : 1)));
      }
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [typedText, isDeleting, currentPhraseIdx]);

  useEffect(() => {
    // If already logged in, redirect to dashboard
    const token = localStorage.getItem("token");
    if (token) {
      router.push("/dashboard");
      return;
    }

    const handleScroll = () => setScrollYValue(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [router]);

  return (
    <div className="min-h-screen overflow-x-hidden selection:bg-violet-100 selection:text-violet-900 dark:selection:bg-violet-900/50 dark:selection:text-violet-200">
      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 w-full z-50 transition-all duration-300"
        style={{
          backgroundColor: scrollYValue > 20 ? (resolvedTheme === "dark" ? "rgba(9,9,11,0.7)" : "rgba(255,255,255,0.7)") : "transparent",
          backdropFilter: scrollYValue > 20 ? "blur(20px)" : "none",
          borderBottom: scrollYValue > 20 ? `1px solid ${resolvedTheme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` : "1px solid transparent",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center group">
            <Image
              src="/logomark_text_lightmode.png"
              alt="Timeora Logo"
              width={585}
              height={148}
              priority
              className="block h-6 w-auto sm:h-7 sm:w-[111px] object-contain transition-transform group-hover:scale-102 dark:hidden"
            />
            <Image
              src="/logomark_text.png"
              alt="Timeora Logo"
              width={588}
              height={166}
              priority
              className="hidden h-6 w-auto sm:h-7 sm:w-[99px] object-contain transition-transform group-hover:scale-102 dark:block"
            />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={() => setLang(lang === 'en' ? 'id' : 'en')}
              className="p-2 sm:p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 text-slate-600 dark:text-zinc-400"
              aria-label="Toggle language"
            >
              <Globe className="w-5 h-5" />
              <span className="ml-1.5 text-xs font-bold uppercase w-5 text-center inline-block">{lang}</span>
            </button>
            <ThemeToggle className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0" />
            <Link
              href="/login"
              className="hidden sm:inline-block text-sm font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors px-4 py-2"
            >
              {t.signIn}
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-zinc-950 text-white px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl hover:bg-zinc-800 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              {t.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-violet-200/50 dark:from-violet-900/20 via-fuchsia-100/30 dark:via-fuchsia-900/10 to-transparent rounded-full blur-3xl" />
          <motion.div
            style={{ y: backgroundY }}
            className="absolute -inset-y-40 inset-x-0 opacity-[0.4] dark:opacity-[0.07]"
          >
            <div 
              className="w-full h-full"
              style={{
                backgroundImage: "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }} 
            />
          </motion.div>
        </div>

        {/* Floating Badges */}
        <motion.div 
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          className="absolute hidden lg:flex top-40 left-10 items-center gap-2 px-4 py-2 rounded-2xl bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-slate-200/50 dark:border-zinc-700/50 shadow-lg z-10"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
            <Calendar className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Added to Calendar</span>
        </motion.div>

        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
          className="absolute hidden lg:flex bottom-20 right-10 items-center gap-2 px-4 py-2 rounded-2xl bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-slate-200/50 dark:border-zinc-700/50 shadow-lg z-10"
        >
          <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600">
            <Shield className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-300">No Conflicts Detected</span>
        </motion.div>

        <motion.div 
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-4xl mx-auto text-center"
        >
          <motion.div 
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-violet-100 dark:border-violet-800 shadow-sm text-sm text-violet-700 dark:text-violet-300 font-medium mb-8"
          >
            <Sparkles className="w-4 h-4" />
            <span>{t.heroBadge}</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </motion.div>

          <div className="mb-6">
            <span className="inline-block text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 rounded-full">
              {t.trustLine}
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] mb-6">
            {t.heroTitlePrefix}{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
                {t.heroTitleHighlight}
              </span>
              <motion.svg
                className="absolute -bottom-2 left-0 w-full drop-shadow-md"
                viewBox="0 0 300 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <motion.path
                  d="M2 8.5C50 3 100 2 150 5C200 8 250 4 298 7"
                  stroke="url(#paint)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.5, ease: "easeInOut", delay: 0.5 }}
                />
                <defs>
                  <linearGradient id="paint" x1="0" y1="0" x2="300" y2="0">
                    <stop stopColor="#7c3aed" />
                    <stop offset="1" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </motion.svg>
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-500 dark:text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t.heroDescStart} <span className="font-medium text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-zinc-700 shadow-sm min-w-[280px] inline-block text-left relative after:content-['|'] after:animate-pulse after:ml-0.5">{typedText}</span> 
            <br className="hidden sm:block" /> {t.heroDescEnd}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" passHref legacyBehavior>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group flex items-center gap-2 bg-zinc-950 text-white px-8 py-4 rounded-2xl text-base font-semibold hover:bg-zinc-800 transition-colors shadow-xl hover:shadow-2xl"
              >
                {t.heroCtaFree}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.a>
            </Link>
            <Link href="https://github.com/bagusardin25/Timeora" passHref legacyBehavior>
              <motion.a
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-medium text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm hover:shadow-md"
              >
                <GithubIcon className="w-5 h-5" />
                {t.heroCtaGithub}
              </motion.a>
            </Link>
          </div>

        </motion.div>
      </section>

      {/* ─── DEMO PREVIEW ─── */}
      <section className="relative px-6 pb-20 sm:pb-32">
        <div className="max-w-5xl mx-auto mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[2px] font-semibold text-violet-600 dark:text-violet-400 mb-3">
            LIVE INTERACTIVE DEMO
          </div>
          <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Try it right now — <span className="text-violet-600 dark:text-violet-400">English or Indonesian</span>
          </h3>
          <p className="text-slate-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
            Type naturally in either language. Watch the AI parse, detect conflicts, and preview on the calendar.
          </p>
        </div>
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto"
        >
          <div className="relative rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.12)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] overflow-hidden ring-1 ring-slate-100 dark:ring-zinc-800">
            {/* Fake Browser Chrome */}
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-slate-200/60 dark:border-white/5 bg-slate-50/80 dark:bg-zinc-900/80">
              <div className="flex items-center gap-1.5 ml-2">
                <div className="w-3 h-3 rounded-full bg-red-400 shadow-sm" />
                <div className="w-3 h-3 rounded-full bg-amber-400 shadow-sm" />
                <div className="w-3 h-3 rounded-full bg-green-400 shadow-sm" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-2 px-4 sm:px-6 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-sm text-xs font-medium text-slate-500 dark:text-zinc-400 w-48 sm:w-80 justify-center">
                  <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">timeora.com</span>
                </div>
              </div>
            </div>
            {/* App Preview Content */}
            <div className="p-4 sm:p-10 space-y-6 sm:space-y-8 bg-gradient-to-b from-white to-slate-50/50 dark:from-zinc-900 dark:to-zinc-950/50">
              {/* Mode Switcher */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => { setDemoMode('create'); setDemoInput(""); }}
                  className={`px-4 py-1.5 text-sm rounded-full transition ${demoMode === 'create' ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'}`}
                >
                  Create Event
                </button>
                <button 
                  onClick={() => { setDemoMode('reschedule'); setDemoInput(""); }}
                  className={`px-4 py-1.5 text-sm rounded-full transition ${demoMode === 'reschedule' ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'}`}
                >
                  Reschedule
                </button>
                <div className="ml-auto text-xs text-slate-400">Try both modes</div>
              </div>

              {/* Command Bar Preview */}
              <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-sm focus-within:ring-2 focus-within:ring-violet-500/50 transition-all duration-300">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl shadow-inner hidden sm:block relative">
                  {isParsing ? (
                    <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
                  ) : (
                    <Bot className="w-6 h-6 text-violet-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] sm:text-xs font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider mb-0.5 sm:mb-1">
                    AI Assistant • {demoMode === 'create' ? 'Create' : 'Reschedule'}
                  </div>
                  <input
                    type="text"
                    value={demoInput}
                    onChange={(e) => setDemoInput(e.target.value)}
                    placeholder={lang === 'id' 
                      ? (demoMode === 'reschedule' ? "Coba: 'Pindahkan rapat Ari ke Jumat jam 14'" : "Coba: 'Rapat tim besok jam 10 pagi'") 
                      : (demoMode === 'reschedule' ? "Reschedule my meeting with Ari to Friday 2pm" : "Try: 'Team meeting tomorrow at 10am'")}
                    className="w-full bg-transparent border-none focus:outline-none font-medium text-slate-700 dark:text-zinc-300 text-sm sm:text-lg leading-snug placeholder:text-slate-400/70"
                  />
                </div>
                <kbd className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-slate-500 dark:text-zinc-400 shadow-sm">
                  ⌘ K
                </kbd>
              </div>

              {/* Structured Output */}
              {parsedData && (
                <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Parsed Result</div>
                    {appliedMessage && (
                      <div className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full">{appliedMessage}</div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                    <div><span className="text-slate-500">Title:</span> <span className="font-medium">{parsedData.title}</span></div>
                    <div><span className="text-slate-500">Day:</span> <span className="font-medium">{parsedData.day}</span></div>
                    <div><span className="text-slate-500">Time:</span> <span className="font-medium">{parsedData.time}</span></div>
                    <div><span className="text-slate-500">Duration:</span> <span className="font-medium">{parsedData.duration}</span></div>
                    <div><span className="text-slate-500">Intent:</span> <span className="font-medium">{parsedData.intent}</span></div>
                    <div><span className="text-slate-500">Language:</span> <span className="font-medium">{parsedData.language}</span></div>
                  </div>
                </div>
              )}

              {/* Calendar Grid Preview */}
              <div className="flex flex-col sm:grid sm:grid-cols-7 gap-px rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-700 shadow-sm bg-slate-200/50 dark:bg-zinc-800/50">
                <div className="hidden sm:contents">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="bg-slate-50/90 dark:bg-zinc-800/90 backdrop-blur-md px-3 py-3 text-center text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      {day}
                    </div>
                  ))}
                </div>
                {Array.from({ length: 7 }, (_, i) => {
                  const hasStatic = [1, 3, 4].includes(i);
                  const hasDynamic = dynamicEvent?.dayIndex === i;
                  const isVisibleOnMobile = hasStatic || hasDynamic;
                  
                  return (
                  <div key={i} className={`${isVisibleOnMobile ? "block" : "hidden sm:block"} bg-white dark:bg-zinc-900 h-auto sm:h-28 p-4 sm:p-2.5 relative group hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors`}>
                    <div className="flex sm:block items-start gap-4">
                      <span className="text-sm font-medium text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors w-12 sm:w-auto shrink-0 mt-0.5 sm:mt-0">
                        <span className="sm:hidden">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]} </span>
                        {i + 1}
                      </span>
                      <div className="flex-1 flex flex-col gap-2 sm:block sm:space-y-0 relative">
                        {i === 1 && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            className="sm:mt-2 text-xs font-semibold text-white bg-gradient-to-r from-violet-500 to-indigo-500 rounded-lg px-2.5 py-1.5 truncate shadow-md"
                          >
                            Team Standup
                          </motion.div>
                        )}
                        {i === 3 && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            className="sm:mt-2 text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg px-2.5 py-1.5 truncate shadow-md"
                          >
                            Client Call
                          </motion.div>
                        )}
                        {i === 4 && (
                          <>
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9 }}
                              whileInView={{ opacity: 1, scale: 1 }}
                              className="sm:mt-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg px-2.5 py-1.5 truncate shadow-md"
                            >
                              Sprint Review
                            </motion.div>
                            {!hasDynamic && (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                className="sm:mt-1.5 text-xs font-bold text-rose-700 bg-rose-100 rounded-lg px-2.5 py-1.5 truncate border border-rose-200 shadow-sm"
                              >
                                ⚠ {lang === 'id' ? 'Bentrok' : 'Conflict Detected'}
                              </motion.div>
                            )}
                          </>
                        )}
                        
                        {/* Dynamic / Proposed Event */}
                        <AnimatePresence>
                          {hasDynamic && (
                            <motion.div 
                              initial={{ opacity: 0, y: -10, scale: 0.9 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="sm:mt-1.5 text-xs font-semibold text-white bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-lg px-2.5 py-1.5 truncate shadow-md relative z-10 border border-fuchsia-400"
                            >
                              {demoMode === 'reschedule' ? '↻ ' : '✨ '}{dynamicEvent.title} {dynamicEvent.time && `• ${dynamicEvent.time}`}
                            </motion.div>
                          )}
                          {hasDynamic && dynamicEvent.isConflict && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="sm:mt-1.5 text-xs font-bold text-rose-700 bg-rose-100 rounded-lg px-2.5 py-1.5 truncate border border-rose-200 shadow-sm"
                            >
                              ⚠ {lang === 'id' ? 'Bentrok!' : 'Conflict!'}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )})}
              </div>

              {/* Alternative Slots */}
              {alternatives.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-zinc-400 mb-2 flex items-center gap-2">
                    Smart Alternatives — click to apply
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {alternatives.map((alt, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          const newEvent = { 
                            dayIndex: alt.dayIndex, 
                            title: dynamicEvent?.title || "Proposed Slot", 
                            isConflict: [1,3,4].includes(alt.dayIndex),
                            time: alt.time,
                            duration: dynamicEvent?.duration || "1 hour"
                          };
                          setDynamicEvent(newEvent);
                          setSelectedAltIndex(idx);
                          setAppliedMessage("Alternative applied ✓");
                          setTimeout(() => setAppliedMessage(null), 1800);
                        }}
                        className={`px-3 py-1.5 text-xs rounded-xl border transition ${selectedAltIndex === idx 
                          ? 'bg-violet-600 text-white border-violet-600' 
                          : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 hover:border-violet-300'}`}
                      >
                        {alt.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1.5">These are conflict-free suggestions based on your schedule.</div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── SOCIAL PROOF ─── */}
      <section className="px-6 py-12 border-y border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-sm uppercase tracking-[2px] font-semibold text-slate-500 dark:text-zinc-500 mb-3">
              {t.socialProof}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-80">
            {/* Placeholder logos — replace with real when available */}
            {["OpenAI", "Zapier", "Linear", "Notion", "Stripe", "Grab", "Gojek", "Tokopedia"].map((name, i) => (
              <div key={i} className="text-sm font-semibold text-slate-600 dark:text-zinc-400 tracking-tight">
                {name}
              </div>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            {[
              { metric: "500+", label: "Professionals" },
              { metric: "2 Languages", label: "Native Support" },
              { metric: "Real-time", label: "Conflict Detection" },
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-5">
                <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tighter">{item.metric}</div>
                <div className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="px-6 py-20 sm:py-32 bg-white dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
              {t.featuresSectionTitleStart} <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{t.featuresSectionTitleHighlight}</span>
            </h2>
            <p className="text-slate-500 dark:text-zinc-400 max-w-xl mx-auto text-lg sm:text-xl">
              {t.featuresSectionSub} <span className="text-violet-600 dark:text-violet-400 font-medium">Bilingual by design.</span>
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: Brain, color: "violet" },
              { icon: Zap, color: "emerald" },
              { icon: Shield, color: "rose" },
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className={`group relative p-8 rounded-3xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all duration-300 hover:shadow-2xl ${
                  feature.color === "violet" ? "hover:border-violet-100 dark:hover:border-violet-800 hover:shadow-violet-500/5" :
                  feature.color === "emerald" ? "hover:border-emerald-100 dark:hover:border-emerald-800 hover:shadow-emerald-500/5" :
                  "hover:border-rose-100 dark:hover:border-rose-800 hover:shadow-rose-500/5"
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 shadow-sm ${
                    feature.color === "violet"
                      ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                      : feature.color === "emerald"
                      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold mb-3">{t.features[idx].title}</h3>
                <p className="text-slate-500 dark:text-zinc-400 leading-relaxed text-lg">{t.features[idx].desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BILINGUAL ADVANTAGE ─── */}
      <section className="px-6 py-16 sm:py-20 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-semibold tracking-widest mb-4">
            UNIQUE DIFFERENTIATOR
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            {t.bilingualAdvantageTitle}
          </h2>
          <p className="text-lg text-slate-600 dark:text-zinc-400 max-w-2xl mx-auto mb-8">
            {t.bilingualAdvantageDesc}
          </p>

          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="font-semibold mb-1 text-sm text-violet-600">🇮🇩 Indonesian</div>
              <div className="text-sm text-slate-500">"Rapat tim marketing besok jam 14.00 selama 45 menit"</div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="font-semibold mb-1 text-sm text-violet-600">🇬🇧 English</div>
              <div className="text-sm text-slate-500">"Marketing sync tomorrow at 2pm for 45 minutes"</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INTEGRATIONS & TRUST ─── */}
      <section className="px-6 py-16 sm:py-20 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50">
        <div className="max-w-6xl mx-auto">
          {/* Integrations */}
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
              {t.integrationsTitle}
            </h2>
            <p className="text-slate-500 dark:text-zinc-400 text-lg max-w-md mx-auto">
              {t.integrationsSub}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-12">
            {[
              { name: "Google Calendar", color: "#4285F4" },
              { name: "Outlook", color: "#0078D4" },
              { name: "Slack", color: "#4A154B" },
              { name: "Linear", color: "#5E6AD2" },
              { name: "Asana", color: "#F06A6A" },
              { name: "Todoist", color: "#E44332" },
              { name: "Zapier", color: "#FF4F00" },
              { name: "Zoom", color: "#2D8CFF" },
            ].map((tool, idx) => (
              <div 
                key={idx} 
                className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 hover:border-violet-200 dark:hover:border-violet-800 transition-all hover:shadow-sm"
              >
                {/* Real brand logo SVGs (inline for performance & no external deps) */}
                {tool.name === "Google Calendar" && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="4" width="18" height="17" rx="2" fill="#4285F4"/>
                    <path d="M8 2v4M16 2v4M3 10h18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="8" cy="14" r="1.5" fill="white"/>
                    <circle cx="12" cy="14" r="1.5" fill="white"/>
                    <circle cx="16" cy="14" r="1.5" fill="white"/>
                    <circle cx="8" cy="18" r="1.5" fill="white"/>
                    <circle cx="12" cy="18" r="1.5" fill="white"/>
                  </svg>
                )}
                {tool.name === "Outlook" && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4"/>
                    <path d="M6 8h12M6 12h8M6 16h6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M18 8l-4 4 4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {tool.name === "Slack" && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8.5 4C7.67 4 7 4.67 7 5.5v3h-1.5C4.67 8.5 4 9.17 4 10v3.5c0 .83.67 1.5 1.5 1.5H7v3c0 .83.67 1.5 1.5 1.5h3.5c.83 0 1.5-.67 1.5-1.5v-3h1.5c.83 0 1.5-.67 1.5-1.5V10c0-.83-.67-1.5-1.5-1.5H13V5.5c0-.83-.67-1.5-1.5-1.5H8.5z" fill="#4A154B"/>
                    <path d="M15.5 20c.83 0 1.5-.67 1.5-1.5v-3h1.5c.83 0 1.5-.67 1.5-1.5V10c0-.83-.67-1.5-1.5-1.5H17V5.5c0-.83-.67-1.5-1.5-1.5h-3.5c-.83 0-1.5.67-1.5 1.5v3H9c-.83 0-1.5.67-1.5 1.5v3.5c0 .83.67 1.5 1.5 1.5H11v3c0 .83.67 1.5 1.5 1.5h3z" fill="#36C5F0"/>
                  </svg>
                )}
                {tool.name === "Linear" && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4l16 16M20 4L4 20" stroke="#5E6AD2" strokeWidth="3.5" strokeLinecap="round"/>
                    <circle cx="12" cy="12" r="3" fill="#5E6AD2"/>
                  </svg>
                )}
                {tool.name === "Asana" && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="7" r="3" fill="#F06A6A"/>
                    <circle cx="7" cy="17" r="3" fill="#F06A6A"/>
                    <circle cx="17" cy="17" r="3" fill="#F06A6A"/>
                    <path d="M9 9l3 5M15 9l-3 5" stroke="#F06A6A" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                )}
                {tool.name === "Todoist" && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="18" height="18" rx="4" fill="#E44332"/>
                    <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {tool.name === "Zapier" && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3v18M3 12h18" stroke="#FF4F00" strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M6 6l12 12M18 6L6 18" stroke="#FF4F00" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                )}
                {tool.name === "Zoom" && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="5" width="14" height="14" rx="2" fill="#2D8CFF"/>
                    <path d="M17 9l4-2v10l-4-2" fill="#2D8CFF"/>
                  </svg>
                )}
                <span className="font-semibold text-sm text-slate-700 dark:text-zinc-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                  {tool.name}
                </span>
              </div>
            ))}
          </div>

          <div className="text-center text-xs text-slate-500 dark:text-zinc-500">
            + many more via Zapier and direct API
          </div>

          {/* Trust Grid */}
          <div className="text-center mb-6">
            <h3 className="text-xl font-semibold mb-6">{t.trustTitle}</h3>
          </div>
          <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
            {t.trustItems.map((item, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-medium text-slate-600 dark:text-zinc-400"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {item}
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-zinc-500 mt-6">
            Enterprise-grade security coming soon • SOC 2 & GDPR compliant
          </p>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="relative px-6 py-20 sm:py-32 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50 overflow-hidden">
        {/* Subtle Background Ornaments */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[400px] bg-gradient-to-b from-violet-100/50 dark:from-violet-900/10 to-transparent blur-3xl opacity-50" />
          <div 
            className="absolute inset-0 opacity-[0.3] dark:opacity-[0.05]"
            style={{
              backgroundImage: "radial-gradient(#94a3b8 1px, transparent 1px)",
              backgroundSize: "24px 24px"
            }}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
              {t.howItWorksTitle}
            </h2>
            <p className="text-slate-500 dark:text-zinc-400 text-lg sm:text-xl">{t.howItWorksSub}</p>
          </motion.div>

          <div className="space-y-12 sm:space-y-16">
            {[
              { step: "01", icon: Sparkles },
              { step: "02", icon: Zap },
              { step: "03", icon: CheckCircle2 },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="flex items-start gap-6 sm:gap-8 group"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-sm flex items-center justify-center group-hover:bg-violet-600 group-hover:border-violet-600 group-hover:shadow-violet-200 dark:group-hover:shadow-violet-900 transition-all duration-300">
                  <item.icon className="w-5 h-5 text-slate-400 dark:text-zinc-500 group-hover:text-white transition-colors duration-300" />
                </div>
                <div className="pt-0">
                  <div className="text-xs font-black text-violet-500 tracking-widest uppercase mb-1.5">
                    Step {item.step}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">{t.steps[i].title}</h3>
                  <p className="text-slate-500 dark:text-zinc-400 leading-relaxed text-base sm:text-lg">{t.steps[i].desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="px-6 py-20 sm:py-32 bg-white dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MessageCircleQuestion className="w-6 h-6" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              {t.faqTitle}
            </h2>
            <p className="text-slate-500 dark:text-zinc-400 text-lg">
              {t.faqSub}
            </p>
          </motion.div>

          <div className="space-y-4">
            {FAQS.map((faq, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 hover:border-violet-200 dark:hover:border-violet-800 transition-colors"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full flex items-center justify-between p-6 text-left"
                  aria-expanded={openFaq === index}
                  aria-controls={`faq-answer-${index}`}
                >
                  <span className="text-lg font-semibold text-slate-800 dark:text-zinc-200">
                    {lang === 'id' ? faq.questionId : faq.questionEn}
                  </span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-zinc-500 transition-transform duration-300 ${openFaq === index ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {openFaq === index && (
                    <motion.div
                      id={`faq-answer-${index}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pt-0 text-slate-500 dark:text-zinc-400 leading-relaxed">
                        {lang === 'id' ? faq.answerId : faq.answerEn}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="px-6 py-20 sm:py-32 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="p-12 sm:p-20 rounded-[2.5rem] bg-zinc-950 text-white relative overflow-hidden shadow-2xl">
            {/* Glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/30 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-600/20 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6 leading-tight">
                {t.ctaTitle}
              </h2>
              <p className="text-zinc-400 text-lg sm:text-xl mb-10 max-w-xl mx-auto leading-relaxed">
                {t.ctaSub}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register" passHref legacyBehavior>
                  <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="group inline-flex items-center gap-2 bg-white text-zinc-950 px-10 py-4 rounded-2xl text-lg font-bold hover:bg-zinc-100 transition-colors shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_60px_rgba(255,255,255,0.3)]"
                  >
                    {t.ctaButton}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </motion.a>
                </Link>
                <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Already have an account? Sign in →
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="px-6 py-12 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image
              src="/logomark_lightmode.png"
              alt="Timeora Logo"
              width={474}
              height={403}
              className="block dark:hidden w-8 h-8 object-contain"
            />
            <Image
              src="/logomark.png"
              alt="Timeora Logo"
              width={627}
              height={502}
              className="hidden dark:block w-8 h-8 object-contain"
            />
            <span className="text-lg font-bold text-slate-800 dark:text-zinc-200 tracking-tight">Timeora</span>
            <span className="text-sm text-slate-400 dark:text-zinc-500 ml-4 hidden sm:block">
              Built for TestSprite Hackathon S3
            </span>
          </div>
          <div className="flex items-center gap-8 text-sm font-medium text-slate-500 dark:text-zinc-400">
            <a
              href="https://github.com/bagusardin25/Timeora"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-2 py-3 sm:py-0"
            >
              <GithubIcon className="w-5 h-5" />
              GitHub
            </a>
            <span>By Bagus Ardin Prayoga</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

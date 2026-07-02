"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

const FAQS = [
  {
    question: "How does the AI scheduling work?",
    answer: "Our natural language processing engine parses your input (e.g., 'Lunch tomorrow at 12pm') and automatically extracts the date, time, and intent to create a calendar event."
  },
  {
    question: "Does Timeora detect scheduling conflicts?",
    answer: "Yes! Timeora cross-references your existing calendar and alerts you immediately if there's a double booking, suggesting the next available slot."
  },
  {
    question: "Can I use Timeora in Indonesian?",
    answer: "Absolutely. Our AI is trained to understand both English and Indonesian seamlessly, so you can type just like you'd chat with a colleague."
  },
  {
    question: "Is Timeora free to use?",
    answer: "Currently, Timeora is in beta and completely free for early adopters. We plan to introduce premium team features in the future."
  }
];

export default function LandingPage() {
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    // If already logged in, redirect to dashboard
    const token = localStorage.getItem("token");
    if (token) {
      router.push("/dashboard");
      return;
    }

    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-900 overflow-x-hidden selection:bg-violet-100 selection:text-violet-900">
      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 w-full z-50 transition-all duration-300"
        style={{
          backgroundColor: scrollY > 20 ? "rgba(255,255,255,0.7)" : "transparent",
          backdropFilter: scrollY > 20 ? "blur(20px)" : "none",
          borderBottom: scrollY > 20 ? "1px solid rgba(0,0,0,0.05)" : "1px solid transparent",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all">
              <span className="text-white font-bold text-lg leading-none tracking-tighter">T</span>
            </div>
            <span className="font-bold text-lg tracking-tight">Timeora</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors px-4 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-zinc-950 text-white px-5 py-2.5 rounded-xl hover:bg-zinc-800 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-violet-200/50 via-fuchsia-100/30 to-transparent rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.4]"
            style={{
              backgroundImage:
                "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-4xl mx-auto text-center"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-violet-100 shadow-sm text-sm text-violet-700 font-medium mb-8"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI-Powered Scheduling</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </motion.div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] mb-6">
            Schedule with{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
                natural language
              </span>
              <svg
                className="absolute -bottom-2 left-0 w-full drop-shadow-md"
                viewBox="0 0 300 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 8.5C50 3 100 2 150 5C200 8 250 4 298 7"
                  stroke="url(#paint)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="paint" x1="0" y1="0" x2="300" y2="0">
                    <stop stopColor="#7c3aed" />
                    <stop offset="1" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Type <span className="font-medium text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-sm">&quot;Meeting dengan tim besok jam 10 pagi&quot;</span> and 
            Timeora handles the rest — parsing, conflict checking, and smart suggestions.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="group flex items-center gap-2 bg-zinc-950 text-white px-8 py-4 rounded-2xl text-base font-semibold hover:bg-zinc-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
            >
              Start Scheduling Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="https://github.com/bagusardin25/Timeora"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-medium text-slate-700 hover:text-slate-900 border border-slate-200 bg-white/50 backdrop-blur-sm hover:bg-white transition-all hover:-translate-y-1 shadow-sm hover:shadow-md"
            >
              <GithubIcon className="w-5 h-5" />
              View on GitHub
            </a>
          </div>
        </motion.div>
      </section>

      {/* ─── DEMO PREVIEW ─── */}
      <section className="relative px-6 pb-20 sm:pb-32">
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto"
        >
          <div className="relative rounded-3xl border border-slate-200/60 bg-white/60 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.12)] overflow-hidden ring-1 ring-slate-100">
            {/* Fake Browser Chrome */}
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-slate-200/60 bg-slate-50/80">
              <div className="flex items-center gap-1.5 ml-2">
                <div className="w-3 h-3 rounded-full bg-red-400 shadow-sm" />
                <div className="w-3 h-3 rounded-full bg-amber-400 shadow-sm" />
                <div className="w-3 h-3 rounded-full bg-green-400 shadow-sm" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-2 px-6 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm text-xs font-medium text-slate-500 w-80 justify-center">
                  <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  timeora.com
                </div>
              </div>
            </div>
            {/* App Preview Content */}
            <div className="p-6 sm:p-10 space-y-8 bg-gradient-to-b from-white to-slate-50/50">
              {/* Command Bar Preview */}
              <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm transform hover:scale-[1.01] transition-transform duration-300">
                <div className="p-3 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl shadow-inner">
                  <Sparkles className="w-6 h-6 text-violet-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-violet-500 uppercase tracking-wider mb-1">AI Assistant</div>
                  <div className="font-medium text-slate-700 text-lg">
                    &quot;Meeting tim marketing besok jam 10 selama 45 menit&quot;
                  </div>
                </div>
                <kbd className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-500 shadow-sm">
                  ⌘ K
                </kbd>
              </div>
              {/* Calendar Grid Preview */}
              <div className="grid grid-cols-7 gap-px rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-200/50">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <div key={day} className="bg-slate-50/90 backdrop-blur-md px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className="bg-white h-28 p-2.5 relative group hover:bg-slate-50 transition-colors">
                    <span className="text-sm font-medium text-slate-400 group-hover:text-slate-600 transition-colors">{i + 1}</span>
                    {i === 1 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 }}
                        className="mt-2 text-xs font-semibold text-white bg-gradient-to-r from-violet-500 to-indigo-500 rounded-lg px-2.5 py-1.5 truncate shadow-md"
                      >
                        Team Standup
                      </motion.div>
                    )}
                    {i === 3 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="mt-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg px-2.5 py-1.5 truncate shadow-md"
                      >
                        Client Call
                      </motion.div>
                    )}
                    {i === 4 && (
                      <>
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 }}
                          className="mt-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg px-2.5 py-1.5 truncate shadow-md"
                        >
                          Sprint Review
                        </motion.div>
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.4 }}
                          className="mt-1.5 text-xs font-bold text-rose-700 bg-rose-100 rounded-lg px-2.5 py-1.5 truncate border border-rose-200 shadow-sm"
                        >
                          ⚠ Conflict
                        </motion.div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="px-6 py-20 sm:py-32 bg-white border-t border-slate-100">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
              Everything you need to <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">own your time</span>
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto text-lg sm:text-xl">
              Three powerful features seamlessly integrated into one premium experience.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                icon: Brain,
                color: "violet",
                title: "Natural Language AI",
                desc: "Just type what you want. Our AI understands contexts, parses dates, durations, and participants automatically.",
              },
              {
                icon: Calendar,
                color: "indigo",
                title: "Interactive Calendar",
                desc: "Beautiful weekly calendar with drag-and-drop, resize events, and real-time updates — all with silky animations.",
              },
              {
                icon: Shield,
                color: "blue",
                title: "Conflict Detection",
                desc: "Timeora catches scheduling conflicts before they happen and suggests AI-powered alternative time slots instantly.",
              },
            ].map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="group relative p-8 rounded-3xl border border-slate-100 bg-white hover:border-violet-100 hover:shadow-2xl hover:shadow-violet-500/5 transition-all duration-300"
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 shadow-sm ${
                    feature.color === "violet"
                      ? "bg-violet-100 text-violet-600"
                      : feature.color === "indigo"
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-blue-100 text-blue-600"
                  }`}
                >
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed text-lg">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="px-6 py-20 sm:py-32 border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-4xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
              How it works
            </h2>
            <p className="text-slate-500 text-lg sm:text-xl">Three steps. Zero friction. Pure productivity.</p>
          </motion.div>

          <div className="space-y-16">
            {[
              {
                step: "01",
                icon: Sparkles,
                title: "Type in natural language",
                desc: 'Open the Command Bar (⌘K) and type something like "Lunch meeting with Ari next Tuesday at noon for 1 hour".',
              },
              {
                step: "02",
                icon: Zap,
                title: "AI parses & checks conflicts",
                desc: "Our AI extracts the structured event data and checks against your existing schedule in real-time.",
              },
              {
                step: "03",
                icon: CheckCircle2,
                title: "Confirm & done",
                desc: "Review the pre-filled event form, tweak if needed, hit save. Your event appears on the calendar instantly.",
              },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="flex items-start gap-8 group"
              >
                <div className="flex-shrink-0 w-16 h-16 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-center group-hover:bg-violet-600 group-hover:border-violet-600 group-hover:shadow-violet-200 transition-all duration-300">
                  <item.icon className="w-7 h-7 text-slate-400 group-hover:text-white transition-colors duration-300" />
                </div>
                <div className="pt-1">
                  <div className="text-sm font-black text-violet-500 tracking-widest uppercase mb-2">
                    Step {item.step}
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{item.title}</h3>
                  <p className="text-slate-500 leading-relaxed text-lg">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="px-6 py-20 sm:py-32 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MessageCircleQuestion className="w-6 h-6" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-slate-500 text-lg">
              Everything you need to know about Timeora.
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
                className="border border-slate-200 rounded-2xl overflow-hidden bg-white hover:border-violet-200 transition-colors"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="text-lg font-semibold text-slate-800">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${openFaq === index ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {openFaq === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pt-0 text-slate-500 leading-relaxed">
                        {faq.answer}
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
      <section className="px-6 py-20 sm:py-32 border-t border-slate-100 bg-white">
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
                Ready to reclaim your time?
              </h2>
              <p className="text-zinc-400 text-lg sm:text-xl mb-10 max-w-xl mx-auto leading-relaxed">
                Join Timeora and start scheduling smarter — powered by AI, designed for modern professionals.
              </p>
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 bg-white text-zinc-950 px-10 py-4 rounded-2xl text-lg font-bold hover:bg-zinc-100 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_60px_rgba(255,255,255,0.3)] hover:-translate-y-1"
              >
                Get Started for Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="px-6 py-12 border-t border-slate-100 bg-slate-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-950 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm leading-none">T</span>
            </div>
            <span className="text-lg font-bold text-slate-800 tracking-tight">Timeora</span>
            <span className="text-sm text-slate-400 ml-4 hidden sm:block">
              Built for TestSprite Hackathon S3
            </span>
          </div>
          <div className="flex items-center gap-8 text-sm font-medium text-slate-500">
            <a
              href="https://github.com/bagusardin25/Timeora"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 transition-colors flex items-center gap-2"
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

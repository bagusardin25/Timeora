'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { persistAuthTokens } from '@/lib/session';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);

    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || '/backend-api').replace(/\/+$/, '');
      const response = await fetch(baseUrl + '/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({})) as {
        access_token?: string;
        refresh_token?: string;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(data.detail || `Registration failed (HTTP ${response.status})`);
      }

      if (data.access_token) {
        persistAuthTokens(data);
        router.push('/dashboard');
      } else {
        setSuccess('Account created! Redirecting to login...');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] dark:bg-zinc-950 relative overflow-hidden text-slate-900 dark:text-zinc-100 font-sans">
      {/* Subtle Grid Background */}
      <div 
        className="absolute inset-0 z-0 opacity-40 dark:opacity-10 pointer-events-none" 
        style={{ 
          backgroundImage: "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)", 
          backgroundSize: "40px 40px" 
        }} 
      />
      
      {/* Soft radial glow */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-100/40 dark:from-indigo-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="z-10 flex flex-col items-center w-full max-w-[420px] px-4">
        {/* Brand Logo Header */}
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image
              src="/logomark_text_lightmode.png"
              alt="Timeora Logo"
              width={585}
              height={148}
              className="block h-10 w-auto object-contain dark:hidden"
            />
            <Image
              src="/logomark_text.png"
              alt="Timeora Logo"
              width={588}
              height={166}
              className="hidden h-10 w-auto object-contain dark:block"
            />
          </Link>
        </div>

        {/* Main Card */}
        <div className="w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] border border-slate-100 dark:border-zinc-800 p-8 sm:p-10 relative">
          <div className="text-center mb-8">
            <h2 className="text-[22px] font-bold text-slate-900 dark:text-zinc-100 mb-1.5">Create Account</h2>
            <p className="text-slate-500 dark:text-zinc-400 text-[14px]">Join Timeora simulation workspace</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-5">
            {error && (
              <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-lg text-center">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-lg text-center">
                {success}
              </div>
            )}
            
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-slate-600 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider ml-1">Full Name</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-slate-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <Input 
                  id="name" 
                  type="text" 
                  placeholder="John Doe" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="pl-10 h-11 bg-slate-50/50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 focus-visible:ring-[#0f3b8c]/20 focus-visible:border-[#0f3b8c] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 rounded-xl transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-600 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider ml-1">Email</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
                </div>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="you@example.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-11 bg-slate-50/50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 focus-visible:ring-[#0f3b8c]/20 focus-visible:border-[#0f3b8c] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 rounded-xl transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-slate-600 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider ml-1">Password</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
                </div>
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-10 h-11 bg-slate-50/50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 focus-visible:ring-[#0f3b8c]/20 focus-visible:border-[#0f3b8c] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 rounded-xl transition-all"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-slate-600 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider ml-1">Confirm Password</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
                </div>
                <Input 
                  id="confirmPassword" 
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="pl-10 pr-10 h-11 bg-slate-50/50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 focus-visible:ring-[#0f3b8c]/20 focus-visible:border-[#0f3b8c] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 rounded-xl transition-all"
                />
                <button 
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 bg-[#0f3b8c] hover:bg-[#0c2e6d] text-white rounded-xl font-medium transition-all shadow-sm flex items-center justify-center gap-2 mt-2" 
              disabled={loading || !!success}
            >
              {loading ? 'Creating account...' : 'Sign Up'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </Button>
          </form>

          <div className="mt-8 text-center text-[13px] text-slate-500 dark:text-zinc-400">
            Already have an account?{' '}
            <Link href="/login" className="text-[#0f3b8c] dark:text-violet-400 font-semibold hover:underline">
              Sign in
            </Link>
          </div>
        </div>

        {/* Back to home */}
        <Link href="/" className="mt-8 flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>
      </div>
    </div>
  );
}

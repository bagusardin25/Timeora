'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '');
      const response = await fetch(baseUrl + '/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || `Login failed (HTTP ${response.status})`);
      }

      localStorage.setItem('token', data.access_token);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] relative overflow-hidden text-slate-900 font-sans">
      {/* Subtle Grid Background */}
      <div 
        className="absolute inset-0 z-0 opacity-40 pointer-events-none" 
        style={{ 
          backgroundImage: "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)", 
          backgroundSize: "40px 40px" 
        }} 
      />
      
      {/* Soft radial glow */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-100/40 via-transparent to-transparent pointer-events-none" />

      <div className="z-10 flex flex-col items-center w-full max-w-[420px] px-4">
        {/* Brand Logo Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-zinc-950 rounded-[10px] flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-xl leading-none tracking-tighter">T</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Timeora</h1>
        </div>

        {/* Main Card */}
        <div className="w-full bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10 relative">
          <div className="text-center mb-8">
            <h2 className="text-[22px] font-bold text-slate-900 mb-1.5">Welcome back</h2>
            <p className="text-slate-500 text-[14px]">Sign in to your intelligent time companion</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">
                {error}
              </div>
            )}
            
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-600 text-xs font-semibold uppercase tracking-wider ml-1">Email</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="you@example.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-11 bg-slate-50/50 border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 text-slate-900 placeholder:text-slate-400 rounded-xl transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-slate-600 text-xs font-semibold uppercase tracking-wider ml-1">Password</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-10 h-11 bg-slate-50/50 border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 text-slate-900 placeholder:text-slate-400 rounded-xl transition-all"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 bg-[#0f3b8c] hover:bg-[#0c2e6d] text-white rounded-xl font-medium transition-all shadow-sm flex items-center justify-center gap-2 mt-2" 
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </Button>
          </form>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-100"></div>
            <span className="text-xs font-medium text-slate-400 uppercase">or</span>
            <div className="flex-1 h-px bg-slate-100"></div>
          </div>

          <button 
            type="button"
            className="w-full mt-6 h-11 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-medium transition-all flex items-center justify-center gap-3"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="mt-8 text-center text-[13px] text-slate-500">
            Don't have an account?{' '}
            <Link href="/register" className="text-[#0f3b8c] font-semibold hover:underline">
              Create one
            </Link>
          </div>
        </div>

        {/* Back to home */}
        <Link href="/" className="mt-8 flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>
      </div>
    </div>
  );
}

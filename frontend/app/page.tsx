'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <header className="border-b bg-white dark:bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Timeora</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        <div className="rounded-xl border bg-white dark:bg-zinc-900 p-8 text-center text-zinc-500">
          Command Bar Placeholder (Phase 3)
        </div>
        
        <div className="rounded-xl border bg-white dark:bg-zinc-900 p-8 h-[500px] flex items-center justify-center text-zinc-500">
          Calendar Area Placeholder (Phase 2)
        </div>
      </main>
    </div>
  );
}

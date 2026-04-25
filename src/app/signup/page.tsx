'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Btn } from '@/components/paper';
import { GoogleButton } from '@/components/ui/GoogleButton';
import { useToast } from '@/components/ui/Toast';

function SignupForm() {
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp, signInWithGoogle, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [authLoading, user, router]);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      showToast('Welcome!', 'success');
      router.push('/dashboard');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign up with Google';
      showToast(errorMessage, 'error');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (formData.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setLoading(true);

    try {
      await signUp({
        email: formData.email,
        password: formData.password,
        displayName: formData.displayName,
      });
      showToast('Account created successfully!', 'success');
      router.push('/dashboard');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create account';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div
        className="w-full max-w-md rounded-[14px] border p-8"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div
              className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center font-bold text-[13px]"
              style={{
                background: 'var(--ink)',
                color: 'var(--bg)',
                letterSpacing: '-0.5px',
              }}
            >
              C
            </div>
            <span
              className="text-[15px] font-semibold"
              style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
            >
              CoachSimplify
            </span>
          </Link>
          <h1
            className="mt-6 text-[22px] md:text-[24px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Create your account
          </h1>
          <p
            className="mt-1.5 text-[13px]"
            style={{ color: 'var(--ink-3)' }}
          >
            Free during early access · no card required
          </p>
        </div>

        <div className="mt-7">
          <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Sign up with Google" />
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
          <span
            className="text-[10.5px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--ink-4)' }}
          >
            or
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PaperField
            id="displayName"
            name="displayName"
            type="text"
            label="Your name"
            value={formData.displayName}
            onChange={handleChange}
            placeholder="e.g. Coach Wei"
            required
          />
          <PaperField
            id="email"
            name="email"
            type="email"
            label="Email"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@example.com"
            required
          />
          <PaperField
            id="password"
            name="password"
            type="password"
            label="Password"
            value={formData.password}
            onChange={handleChange}
            placeholder="At least 6 characters"
            required
          />
          <PaperField
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm password"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Re-enter your password"
            required
          />

          <Btn type="submit" variant="primary" size="lg" full disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Btn>
        </form>

        <p
          className="mt-6 text-center text-[13px]"
          style={{ color: 'var(--ink-2)' }}
        >
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold underline underline-offset-2"
            style={{ color: 'var(--ink)' }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

interface PaperFieldProps {
  id: string;
  name?: string;
  type: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
}

function PaperField({ id, name, type, label, value, onChange, placeholder, required }: PaperFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[13px] font-medium mb-1.5"
        style={{ color: 'var(--ink-2)' }}
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="block w-full rounded-[8px] border px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-[var(--ink)]"
        style={{
          background: 'var(--bg)',
          borderColor: 'var(--line-2)',
          color: 'var(--ink)',
        }}
      />
    </div>
  );
}

export default function SignupPage() {
  return (
    <AuthProvider>
      <SignupForm />
    </AuthProvider>
  );
}

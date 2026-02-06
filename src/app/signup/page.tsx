'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    slug: '',
    serviceType: 'Swimming Coach',
    whatsappNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Auto-generate slug from display name
    if (name === 'displayName') {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setFormData((prev) => ({ ...prev, slug }));
    }
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

    if (!formData.slug || formData.slug.length < 3) {
      showToast('URL slug must be at least 3 characters', 'error');
      return;
    }

    setLoading(true);

    try {
      await signUp({
        email: formData.email,
        password: formData.password,
        displayName: formData.displayName,
        slug: formData.slug,
        serviceType: formData.serviceType,
        whatsappNumber: formData.whatsappNumber,
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            CoachApp
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-4">Create your account</h1>
          <p className="text-gray-600 mt-2">Start managing your schedule today</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="displayName"
            name="displayName"
            type="text"
            label="Your Name"
            value={formData.displayName}
            onChange={handleChange}
            placeholder="e.g., Coach Wei"
            required
          />

          <Input
            id="email"
            name="email"
            type="email"
            label="Email"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@example.com"
            required
          />

          <Input
            id="whatsappNumber"
            name="whatsappNumber"
            type="tel"
            label="WhatsApp Number"
            value={formData.whatsappNumber}
            onChange={handleChange}
            placeholder="e.g., +60123456789"
            required
          />

          <Input
            id="serviceType"
            name="serviceType"
            type="text"
            label="Service Type"
            value={formData.serviceType}
            onChange={handleChange}
            placeholder="e.g., Swimming Coach, Tennis Coach"
            required
          />

          <div>
            <Input
              id="slug"
              name="slug"
              type="text"
              label="Your Public URL"
              value={formData.slug}
              onChange={handleChange}
              placeholder="coach-wei"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Your page: coachapp.com/<span className="font-medium">{formData.slug || 'your-name'}</span>
            </p>
          </div>

          <Input
            id="password"
            name="password"
            type="password"
            label="Password"
            value={formData.password}
            onChange={handleChange}
            placeholder="At least 6 characters"
            required
          />

          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Confirm your password"
            required
          />

          <Button type="submit" className="w-full" loading={loading}>
            Create Account
          </Button>
        </form>

        <p className="text-center text-gray-600 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

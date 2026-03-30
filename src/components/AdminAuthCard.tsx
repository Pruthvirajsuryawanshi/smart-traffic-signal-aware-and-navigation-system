import { useMemo, useState } from 'react';

type AuthView = 'login' | 'forgot' | 'reset';

const ADMIN_ID = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const AUTH_CONTACTS = [ADMIN_ID, 'admin@example.com', '+1234567890'];

const isValidEmailOrMobile = (value: string) => {
  const normalized = value.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mobilePattern = /^\+?\d{7,15}$/;
  return emailPattern.test(normalized) || mobilePattern.test(normalized);
};

const isValidAdminContact = (value: string) => {
  const normalized = value.trim();
  return normalized === ADMIN_ID || isValidEmailOrMobile(normalized);
};

interface AdminAuthCardProps {
  onAuthenticated: () => void;
}

export default function AdminAuthCard({ onAuthenticated }: AdminAuthCardProps) {
  const [view, setView] = useState<AuthView>('login');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState(DEFAULT_ADMIN_PASSWORD);

  const normalizedContact = contact.trim();
  const contactValid = useMemo(
    () => normalizedContact.length > 0 && isValidAdminContact(normalizedContact),
    [normalizedContact],
  );

  const handleClearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleLogin = () => {
    handleClearMessages();

    if (!normalizedContact) {
      setError('Admin ID, email, or mobile number is required.');
      return;
    }
    if (!contactValid) {
      setError('Enter a valid admin ID, email, or mobile number.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (password !== adminPassword) {
      setError('Incorrect password.');
      return;
    }

    onAuthenticated();
  };

  const handleSendOtp = () => {
    handleClearMessages();

    if (!normalizedContact) {
      setError('Email or mobile number is required.');
      return;
    }
    if (!contactValid) {
      setError('Enter a valid email or mobile number.');
      return;
    }
    if (!AUTH_CONTACTS.includes(normalizedContact)) {
      setError('Use the registered admin email or mobile number.');
      return;
    }

    const otpValue = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(otpValue);
    setSuccess(`OTP sent to your registered email/mobile.`);
    setView('reset');
  };

  const handleResetPassword = () => {
    handleClearMessages();

    if (!otp.trim()) {
      setError('OTP is required.');
      return;
    }
    if (!generatedOtp || otp.trim() !== generatedOtp) {
      setError('Invalid OTP.');
      return;
    }
    if (newPassword.trim().length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setAdminPassword(newPassword);
    setSuccess('Password reset successful. Please log in with your new password.');
    setView('login');
    setPassword('');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleBackToLogin = () => {
    handleClearMessages();
    setView('login');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-950/95 p-6 shadow-2xl shadow-black/30 ring-1 ring-white/10">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Admin authentication</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Secure admin access</h2>
        <p className="mt-2 text-sm text-slate-400">
          {view === 'login'
            ? 'Sign in with your registered email or mobile number.'
            : view === 'forgot'
            ? 'Receive an OTP on your registered email or mobile.'
            : 'Use the OTP to choose a new password.'}
        </p>
      </div>

      {success && (
        <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (view === 'login') handleLogin();
          if (view === 'forgot') handleSendOtp();
          if (view === 'reset') handleResetPassword();
        }}
      >
        {(view === 'login' || view === 'forgot') && (
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Email or mobile number
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              className="mt-2 h-9 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
            />
          </label>
        )}

        {view === 'login' && (
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Password
            <div className="relative mt-2">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-9 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 pr-10 text-sm text-white shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((state) => !state)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-white"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
        )}

        {view === 'reset' && (
          <>
            <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              OTP code
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                className="mt-2 h-9 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
                placeholder="000000"
              />
            </label>
            <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              New password
              <div className="relative mt-2">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 pr-10 text-sm text-white shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
                  placeholder="New password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((state) => !state)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  {showNewPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Confirm password
              <div className="relative mt-2">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 pr-10 text-sm text-white shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
                  placeholder="Confirm password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((state) => !state)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
          </>
        )}

        <div className="grid gap-3">
          <button
            type="submit"
            className="h-10 rounded-xl bg-sky-500 text-sm font-semibold text-white transition hover:bg-sky-400"
          >
            {view === 'login' ? 'Login' : view === 'forgot' ? 'Send OTP' : 'Reset Password'}
          </button>
          {view !== 'login' && (
            <button
              type="button"
              onClick={handleBackToLogin}
              className="h-10 rounded-xl border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Back to login
            </button>
          )}
        </div>
      </form>

      {view === 'login' && (
        <div className="mt-4 text-sm text-slate-400">
          Forgot password?{' '}
          <button
            type="button"
            onClick={() => {
              handleClearMessages();
              setView('forgot');
            }}
            className="font-semibold text-white hover:text-sky-300"
          >
            Send OTP
          </button>
        </div>
      )}
    </div>
  );
}

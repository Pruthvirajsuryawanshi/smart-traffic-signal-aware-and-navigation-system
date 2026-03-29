import { useState } from 'react';

interface AmbulanceLoginProps {
  onLogin: () => void;
}

const AmbulanceLogin = ({ onLogin }: AmbulanceLoginProps) => {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (id === 'ambulance' && password === 'ambulance') {
      onLogin();
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border p-3 md:p-4 space-y-3">
      <h2 className="text-sm font-mono font-bold text-foreground tracking-wider uppercase">
        🚑 Ambulance Login
      </h2>

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-mono text-muted-foreground block mb-1">ID</label>
          <input
            type="text"
            value={id}
            onChange={(e) => { setId(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Enter ID"
            className="w-full px-3 py-1.5 rounded-md text-xs font-mono bg-muted text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono text-muted-foreground block mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Enter password"
            className="w-full px-3 py-1.5 rounded-md text-xs font-mono bg-muted text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {error && (
          <p className="text-[10px] font-mono text-signal-red">{error}</p>
        )}
        <button
          onClick={handleLogin}
          className="w-full px-3 py-2 rounded-md text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Login
        </button>
      </div>
    </div>
  );
};

export default AmbulanceLogin;

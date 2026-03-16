import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, LogIn, User, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { apiUrl } from '../utils/api';

const defaultBranding = {
  header: 'Pydah Stationary Portal',
  subheader: 'Efficiently managing academic supplies, inventory, and student allocations in one unified platform.',
};

const Login = ({ onLogin }) => {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [branding, setBranding] = useState(defaultBranding);

  useEffect(() => {
    let isMounted = true;
    const fetchBranding = async () => {
      try {
        const res = await fetch(apiUrl('/api/settings'));
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        
        setBranding({
          header: (typeof data.appName === 'string' && data.appName.trim()) 
            ? data.appName.trim() 
            : (data.receiptHeader || defaultBranding.header),
          subheader: (typeof data.appSubheader === 'string' && data.appSubheader.trim())
            ? data.appSubheader.trim()
            : (data.receiptSubheader || defaultBranding.subheader),
        });
      } catch (error) {
        console.warn('Failed to load branding settings for login:', error);
      }
    };

    fetchBranding();
    return () => {
      isMounted = false;
    };
  }, []);

  const backgroundClass = 'bg-slate-950';
  const cardClass = 'bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40';
  const headingClass = 'text-white';
  const subHeadingClass = 'text-slate-300';
  const labelClass = 'text-slate-200';
  const inputClass = 'bg-white/5 border border-white/10 text-white placeholder-gray-400 focus:ring-blue-500';
  const buttonClass = 'w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-semibold transition-all duration-200';
  const primaryButtonClass = 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/40 hover:shadow-blue-900/60 hover:from-blue-500 hover:to-indigo-500';
  const errorClass = 'bg-red-500/20 border border-red-500/30 text-red-200';
  const textMutedClass = 'text-slate-400';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const success = await onLogin(id, password);
      if (!success) {
        setError('Invalid credentials. Please check your ID and password.');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url('/Stationary-landing.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.9)'
        }}
      />
      
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-black/40 z-10" />

      <div className="flex items-center justify-center w-full relative z-20 px-6 font-sans">
        <div className="max-w-xl w-full mx-auto">
          {/* Login Card */}
          <div className={`${cardClass} rounded-3xl p-10 transition-colors duration-300 relative`}>
            {/* Back to Home Button */}
            <Link 
              to="/" 
              className="absolute top-6 left-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all duration-200 group"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </Link>

            {/* Header */}
            <div className="text-center mb-8 pt-4">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                Stationary Portal
              </h2>
              <p className={`${subHeadingClass} leading-relaxed max-w-sm mx-auto`}>
                {branding.subheader}
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* User ID Field */}
              <div className="space-y-2">
                <label htmlFor="id" className={`block text-sm font-medium ${labelClass}`}>
                  User ID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    id="id"
                    className={`block w-full pl-10 pr-3 py-3 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 ${inputClass}`}
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="Enter your user ID"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label htmlFor="password" className={`block text-sm font-medium ${labelClass}`}>
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className={`block w-full pl-10 pr-12 py-3 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 ${inputClass}`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-300 transition-colors" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-300 transition-colors" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className={`${errorClass} px-4 py-3 rounded-xl text-sm backdrop-blur-sm transition-colors duration-300`}>
                  {error}
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className={`${buttonClass} ${primaryButtonClass} focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5`}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>Access Portal</span>
                  </>
                )}
              </button>
            </form>

            {/* Footer Note */}
            <div className="mt-6 text-center">
              <p className={`${textMutedClass} text-sm`}>
                Secure admin access • Trusted by educational institutions
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
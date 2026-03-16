import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowRight } from 'lucide-react';
import { apiUrl } from '../utils/api';

const fallbackHeader = 'Pydah Stationary Portal';
const fallbackSubheader = 'Efficiently managing academic supplies, inventory, and student allocations in one unified platform.';

const HomePage = () => {
  const [branding, setBranding] = useState({
    header: '',
    subheader: '',
  });

  useEffect(() => {
    let isMounted = true;
    const fetchBranding = async () => {
      try {
        const res = await fetch(apiUrl('/api/settings'));
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        
        const header = typeof data.appName === 'string' && data.appName.trim() 
          ? data.appName.trim() 
          : '';
        const subheader = typeof data.appSubheader === 'string' && data.appSubheader.trim()
          ? data.appSubheader.trim()
          : '';
        
        setBranding({
          header,
          subheader,
        });
      } catch (error) {
        console.warn('Failed to load branding settings:', error);
      }
    };

    fetchBranding();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden">
      {/* Background Image Placeholder */}
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

      {/* Content */}
      <div className="relative z-20 text-center px-4  max-w-5xl">
        <h1 className="inline-block text-4xl md:text-6xl font-bold text-white mb-8 px-10 py-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-full tracking-tight shadow-2xl shadow-black/20">
          PYDAH STATIONARY PORTAL
        </h1>
        
        <p className="text-xl md:text-2xl text-blue-100 mb-12 font-medium max-w-3xl mx-auto leading-relaxed">
          {branding.subheader || fallbackSubheader}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-xl text-lg font-semibold hover:bg-blue-500 transition-all duration-300 shadow-xl shadow-blue-900/40 hover:-translate-y-1"
          >
            Access Portal
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="absolute bottom-8 left-0 right-0 z-20 text-center">
        <p className="text-white/60 text-sm font-medium tracking-widest uppercase">
          Powered by PYDAHSOFT
        </p>
      </div>
    </div>
  );
};

export default HomePage;
 HomePage;
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import { Plus, ThumbsUp, ThumbsDown, Utensils, Info, ChevronRight, MapPin, Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const FOOD_TYPES = ['বিরিয়ানি', 'ছুলামুড়ি', 'তেহেরি', 'খিচুড়ি'];
const FOOD_EMOJIS: Record<string, string> = {
  'বিরিয়ানি': '🍛',
  'ছুলামুড়ি': '🍿',
  'তেহেরি': '🍲',
  'খিচুড়ি': '🥣'
};

// Narail Sadar Bounds
const NARAIL_SADAR_BOUNDS: L.LatLngBoundsExpression = [
  [23.10, 89.40], // South West
  [23.25, 89.60]  // North East
];

interface Mosque {
  id: number;
  name: string;
  lat: number;
  lng: number;
  food_type: string;
  likes: number;
  dislikes: number;
  report_id: number | null;
}

// Initialize socket outside to prevent multiple connections
const socket = io();

export default function App() {
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFood, setFilterFood] = useState('');
  const [isAddingReport, setIsAddingReport] = useState<number | null>(null);
  const [activeMosque, setActiveMosque] = useState<Mosque | null>(null);

  const fetchMosques = useCallback(async () => {
    try {
      const res = await fetch('/api/mosques');
      const data = await res.json();
      setMosques(data);
    } catch (error) {
      console.error('Failed to fetch mosques:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMosques();

    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const handleReportAdded = (newReport: any) => {
      setMosques(prev => prev.map(m => 
        m.id === newReport.mosque_id 
          ? { ...m, food_type: newReport.food_type, report_id: newReport.id, likes: 0, dislikes: 0 } 
          : m
      ));
    };

    const handleVoteUpdated = (updatedReport: any) => {
      setMosques(prev => prev.map(m => 
        m.id === updatedReport.mosque_id 
          ? { ...m, likes: updatedReport.likes, dislikes: updatedReport.dislikes } 
          : m
      ));
    };

    socket.on('report_added', handleReportAdded);
    socket.on('vote_updated', handleVoteUpdated);

    return () => {
      clearTimeout(timeout);
      socket.off('report_added', handleReportAdded);
      socket.off('vote_updated', handleVoteUpdated);
    };
  }, [fetchMosques]);

  const handleAddReport = async (mosqueId: number, foodType: string) => {
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mosque_id: mosqueId, food_type: foodType }),
      });
      setIsAddingReport(null);
    } catch (error) {
      console.error('Failed to add report:', error);
    }
  };

  const handleVote = async (reportId: number, type: 'like' | 'dislike') => {
    if (!reportId) return;
    try {
      await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId, type }),
      });
    } catch (error) {
      console.error('Failed to vote:', error);
    }
  };

  const filteredMosques = useMemo(() => {
    return mosques.filter(m => !filterFood || m.food_type === filterFood);
  }, [mosques, filterFood]);

  // Memoize icon creation to prevent re-creating on every render
  const getIcon = useCallback((foodType: string, hasReport: boolean) => {
    const color = !hasReport ? 'bg-stone-400' : 'bg-emerald-600';
    const emoji = FOOD_EMOJIS[foodType] || '📍';
    const content = !hasReport 
      ? '<span class="text-white text-xl font-bold">+</span>' 
      : `<div class="flex flex-col items-center">
           <span class="text-lg leading-none">${emoji}</span>
           <span class="text-white text-[8px] font-black uppercase leading-none mt-0.5">${foodType}</span>
         </div>`;
    
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div class="w-12 h-12 ${color} rounded-full flex items-center justify-center shadow-lg border-2 border-white transform -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-110">
              ${content}
            </div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-white gap-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            duration: 0.5,
            repeat: Infinity,
            repeatType: "reverse"
          }}
          className="w-24 h-24 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-100"
        >
          <Utensils className="text-white w-12 h-12" />
        </motion.div>
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-2xl font-black text-emerald-900 tracking-tight">বিরিয়ানি ডট কম</h2>
          <div className="flex items-center gap-2 text-stone-400 font-bold text-sm uppercase tracking-widest">
            <Loader2 className="w-4 h-4 animate-spin" />
            লোড হচ্ছে...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#FDFCFB] font-sans text-stone-900 overflow-hidden">
      {/* Modern Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-200 px-6 py-4 z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center gap-3"
          >
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
              <Utensils className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-emerald-900">বিরিয়ানি ডট কম</h1>
              <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold opacity-70">নড়াইল সদর স্পেশাল</p>
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex flex-1 w-full max-w-md gap-3"
          >
            <div className="relative w-full">
              <select
                className="appearance-none w-full pl-12 pr-10 py-3 rounded-2xl bg-stone-100 border-transparent focus:bg-white focus:border-emerald-200 focus:ring-4 focus:ring-emerald-50/50 transition-all outline-none text-sm font-medium cursor-pointer"
                value={filterFood}
                onChange={(e) => setFilterFood(e.target.value)}
              >
                <option value="">খাবার দিয়ে খুঁজুন (সব খাবার)</option>
                {FOOD_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5 pointer-events-none" />
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 w-4 h-4 text-stone-400 pointer-events-none" />
            </div>
          </motion.div>
        </div>
      </header>

      <div className="flex-1 flex relative">
        {/* Sidebar for Stats/List */}
        <aside className="hidden lg:flex flex-col w-80 bg-white border-r border-stone-200 overflow-y-auto p-6 gap-6">
          <div className="flex items-center gap-2 text-stone-500">
            <Info className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">সদর মসজিদের তালিকা</span>
          </div>
          
          <div className="flex flex-col gap-3">
            {filteredMosques.map(m => (
              <motion.button
                key={m.id}
                whileHover={{ x: 4 }}
                onClick={() => setActiveMosque(m)}
                className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left group ${activeMosque?.id === m.id ? 'border-emerald-500 bg-emerald-50' : 'border-stone-100 hover:border-emerald-200 hover:bg-emerald-50/30'}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-bold text-stone-800 group-hover:text-emerald-900">{m.name}</span>
                  <ChevronRight className={`w-4 h-4 transition-colors ${activeMosque?.id === m.id ? 'text-emerald-500' : 'text-stone-300 group-hover:text-emerald-500'}`} />
                </div>
                <span className="text-[10px] mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold uppercase">
                  {m.food_type}
                </span>
              </motion.button>
            ))}
          </div>
        </aside>

        {/* Map Area */}
        <main className="flex-1 relative">
          <MapContainer
            center={[23.1689, 89.5012]}
            zoom={14}
            maxBounds={NARAIL_SADAR_BOUNDS}
            maxBoundsViscosity={1.0}
            minZoom={13}
            className="h-full w-full custom-map"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {filteredMosques.map((mosque) => (
              <Marker 
                key={mosque.id} 
                position={[mosque.lat, mosque.lng]}
                icon={getIcon(mosque.food_type, !!mosque.report_id)}
                eventHandlers={{
                  click: () => setActiveMosque(mosque),
                }}
              >
                <Popup className="modern-popup">
                  <div className="p-4 min-w-[240px]">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-black text-lg text-stone-900 leading-tight">{mosque.name}</h3>
                        <p className="text-[10px] text-stone-400 font-bold uppercase tracking-tighter flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" /> নড়াইল সদর
                        </p>
                      </div>
                    </div>
                    
                    <div className="bg-stone-50 rounded-2xl p-4 border border-stone-100 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">আজকের মেনু</span>
                        <span className="bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-black shadow-sm shadow-emerald-200">
                          {mosque.food_type}
                        </span>
                      </div>
                      {mosque.report_id && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleVote(mosque.report_id!, 'like')}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-white rounded-xl border border-stone-200 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm"
                          >
                            <ThumbsUp className="w-4 h-4" />
                            <span className="text-sm font-bold">{mosque.likes}</span>
                          </button>
                          <button
                            onClick={() => handleVote(mosque.report_id!, 'dislike')}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-white rounded-xl border border-stone-200 hover:border-rose-500 hover:text-rose-600 transition-all shadow-sm"
                          >
                            <ThumbsDown className="w-4 h-4" />
                            <span className="text-sm font-bold">{mosque.dislikes}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setIsAddingReport(mosque.id)}
                      className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-3 rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-stone-200 font-bold text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      খাবার পরিবর্তন/আপডেট করুন
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </main>

        {/* Add Report Modal */}
        <AnimatePresence>
          {isAddingReport && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2000] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl overflow-hidden relative"
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
                <h2 className="text-2xl font-black text-stone-900 mb-2">খাবার নির্বাচন করুন</h2>
                <p className="text-stone-500 text-sm mb-8">সঠিক তথ্য দিয়ে অন্যকে সাহায্য করুন।</p>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  {FOOD_TYPES.map((food) => (
                    <button
                      key={food}
                      onClick={() => handleAddReport(isAddingReport, food)}
                      className="group relative p-6 rounded-3xl border-2 border-stone-100 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-center"
                    >
                      <span className="block text-lg font-bold text-stone-800 group-hover:text-emerald-900">{food}</span>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                          <Plus className="w-3 h-3 text-white" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => setIsAddingReport(null)}
                  className="w-full py-4 text-stone-400 font-bold hover:text-stone-600 transition-colors text-sm"
                >
                  বাতিল করুন
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer with Developer Credit */}
      <footer className="bg-white border-t border-stone-200 py-3 px-6 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-stone-400">
        <p>© ২০২৬ বিরিয়ানি ডট কম - নড়াইল সদর</p>
        <p className="text-emerald-600">Developer: @SIAMAFRID</p>
      </footer>

      <style>{`
        /* Custom Map Styling */
        .custom-map .leaflet-tile-pane {
          filter: grayscale(0.2) contrast(1.1) brightness(1.05);
        }
        
        /* Modern Popup Styling */
        .modern-popup .leaflet-popup-content-wrapper {
          border-radius: 24px;
          padding: 0;
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(0,0,0,0.1);
          border: 1px solid rgba(0,0,0,0.05);
        }
        .modern-popup .leaflet-popup-content {
          margin: 0;
        }
        .modern-popup .leaflet-popup-tip {
          box-shadow: none;
          border: 1px solid rgba(0,0,0,0.05);
        }
        
        /* Hide Leaflet Branding for cleaner look */
        .leaflet-control-attribution {
          display: none !important;
        }

        .custom-div-icon {
          background: none;
          border: none;
        }
      `}</style>
    </div>
  );
}

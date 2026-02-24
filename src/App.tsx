/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import { Plus, ThumbsUp, ThumbsDown, Utensils, Info, ChevronRight, MapPin, Search, Loader2, Map as MapIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db as firestoreDb } from './lib/firebase';

const FOOD_TYPES = ['বিরিয়ানি', 'ছুলামুড়ি', 'তেহেরি', 'খিচুড়ি', 'জানা নাই'];
const FOOD_EMOJIS: Record<string, string> = {
  'বিরিয়ানি': '🍛',
  'ছুলামুড়ি': '🍿',
  'তেহেরি': '🍲',
  'খিচুড়ি': '🥣',
  'জানা নাই': '❓'
};

// Narail Sadar Bounds
const NARAIL_SADAR_BOUNDS: L.LatLngBoundsExpression = [
  [23.10, 89.40], // South West
  [23.25, 89.60]  // North East
];

interface Mosque {
  id: string;
  name: string;
  lat: number;
  lng: number;
  food_type: string;
  likes: number;
  dislikes: number;
  report_id: string | null;
}

// Initialize socket outside to prevent multiple connections
let socketInstance: any = null;
const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io();
  }
  return socketInstance;
};

function MapController({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { duration: 1.5 });
    }
  }, [target, map]);
  return null;
}

function PendingMarker({ position, onConfirm, onCancel }: { position: { lat: number, lng: number }, onConfirm: () => void, onCancel: () => void }) {
  const markerRef = useRef<L.Marker>(null);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.openPopup();
    }
  }, [position]);

  return (
    <Marker 
      ref={markerRef}
      position={[position.lat, position.lng]}
      icon={L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white transform -translate-x-1/2 -translate-y-1/2 animate-bounce">
                <span class="text-white text-2xl font-bold">+</span>
                <div class="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-20"></div>
              </div>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      })}
    >
      <Popup className="modern-popup" closeButton={false} closeOnClick={false}>
        <div className="p-4 text-center min-w-[200px]">
          <p className="font-bold text-stone-800 mb-4 text-sm">নতুন মসজিদ লোকেশন এড করতে চান?</p>
          <div className="flex gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="flex-1 py-3 text-stone-400 font-bold text-[10px] uppercase tracking-widest hover:bg-stone-50 rounded-xl transition-colors"
            >
              না
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirm();
              }}
              className="flex-[2] bg-emerald-600 text-white px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all"
            >
              হ্যাঁ, যোগ করুন
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function MapEvents({ onLongPress }: { onLongPress: (latlng: L.LatLng) => void }) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useMapEvents({
    mousedown: (e) => {
      // Desktop hold (left click only)
      if ((e as any).originalEvent?.button === 0) {
        timerRef.current = setTimeout(() => {
          onLongPress(e.latlng);
          timerRef.current = null;
        }, 1000);
      }
    },
    mouseup: () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    mousemove: (e) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    contextmenu: (e) => {
      // Mobile long-press and desktop right-click
      onLongPress(e.latlng);
    },
    dragstart: () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  });
  return null;
}

export default function App() {
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFood, setFilterFood] = useState('');
  const [isAddingReport, setIsAddingReport] = useState<string | null>(null);
  const [pendingMosque, setPendingMosque] = useState<{ lat: number, lng: number } | null>(null);
  const [isNamingMosque, setIsNamingMosque] = useState(false);
  const [isDeletingMosque, setIsDeletingMosque] = useState<string | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [deleteCode, setDeleteCode] = useState('');
  const [newMosqueName, setNewMosqueName] = useState('');
  const [activeMosque, setActiveMosque] = useState<Mosque | null>(null);
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);
  const markerTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    // Real-time listener for mosques
    const q = query(collection(firestoreDb, "mosques"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mosqueData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Mosque[];
      setMosques(mosqueData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddReport = async (mosqueId: string, foodType: string) => {
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mosque_id: mosqueId, food_type: foodType }),
      });
      const text = await res.text();
      if (!res.ok) {
        let errorMessage = text;
        try {
          const errorJson = JSON.parse(text);
          errorMessage = errorJson.error || text;
        } catch (e) { }
        
        if (text.includes("Rate exceeded")) {
          throw new Error("অতিরিক্ত রিকোয়েস্ট! একটু অপেক্ষা করুন।");
        }
        throw new Error(`সার্ভার এরর (${res.status}): ${errorMessage.substring(0, 200)}`);
      }
      setIsAddingReport(null);
    } catch (error) {
      console.error('Failed to add report:', error);
      alert(`ভুল হয়েছে: ${error instanceof Error ? error.message : 'তথ্য আপডেট করা সম্ভব হয়নি'}`);
    }
  };

  const handleCreateMosque = async () => {
    if (!pendingMosque || !newMosqueName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/mosques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newMosqueName, 
          lat: pendingMosque.lat, 
          lng: pendingMosque.lng 
        }),
      });
      
      const text = await res.text();
      if (!res.ok) {
        let errorMessage = text;
        try {
          const errorJson = JSON.parse(text);
          errorMessage = errorJson.error || text;
        } catch (e) {
          // Not JSON
        }
        
        if (text.includes("Rate exceeded")) {
          throw new Error("অতিরিক্ত রিকোয়েস্ট! একটু অপেক্ষা করুন।");
        }
        if (res.status === 405) {
          throw new Error("সার্ভার এই মেথডটি সাপোর্ট করছে না (405)। দয়া করে ডেভেলপারকে জানান।");
        }
        throw new Error(`সার্ভার এরর (${res.status}): ${errorMessage.substring(0, 200)}`);
      }

      try {
        const mosque = JSON.parse(text);
        setPendingMosque(null);
        setIsNamingMosque(false);
        setNewMosqueName('');
        // Immediately prompt for food
        setIsAddingReport(mosque.id);
      } catch (e) {
        throw new Error("সার্ভার থেকে ভুল তথ্য এসেছে।");
      }
    } catch (error) {
      console.error('Failed to create mosque:', error);
      alert(`ভুল হয়েছে: ${error instanceof Error ? error.message : 'মসজিদ যোগ করা সম্ভব হয়নি'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteMosque = async () => {
    if (!isDeletingMosque || deleteCode !== '1311') return;
    try {
      const res = await fetch(`/api/mosques/${isDeletingMosque}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: deleteCode }),
      });
      const text = await res.text();
      if (!res.ok) {
        if (text.includes("Rate exceeded")) {
          throw new Error("অতিরিক্ত রিকোয়েস্ট! একটু অপেক্ষা করুন।");
        }
        throw new Error(text.substring(0, 50));
      }
      setIsDeletingMosque(null);
      setDeleteCode('');
    } catch (error) {
      console.error('Failed to delete mosque:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to delete mosque'}`);
    }
  };

  const handleVote = async (reportId: string, type: 'like' | 'dislike') => {
    if (!reportId) return;
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId, type }),
      });
      const text = await res.text();
      if (!res.ok) {
        let errorMessage = text;
        try {
          const errorJson = JSON.parse(text);
          errorMessage = errorJson.error || text;
        } catch (e) { }
        
        if (text.includes("Rate exceeded")) {
          throw new Error("অতিরিক্ত রিকোয়েস্ট! একটু অপেক্ষা করুন।");
        }
        throw new Error(`সার্ভার এরর (${res.status}): ${errorMessage.substring(0, 200)}`);
      }
    } catch (error) {
      console.error('Failed to vote:', error);
      alert(`ভুল হয়েছে: ${error instanceof Error ? error.message : 'ভোট দেওয়া সম্ভব হয়নি'}`);
    }
  };

  const handleSearchSelect = (food: string) => {
    setFilterFood(food);
    if (food) {
      setIsSearchModalOpen(true);
    }
  };

  const goToMosque = (mosque: Mosque) => {
    setMapTarget([mosque.lat, mosque.lng]);
    setActiveMosque(mosque);
    setIsSearchModalOpen(false);
  };

  const filteredMosques = useMemo(() => {
    // Show all mosques, filtering by food type if selected
    return mosques.filter(m => !filterFood || m.food_type === filterFood);
  }, [mosques, filterFood]);

  // Memoize icon creation
  const getIcon = useCallback((foodType: string) => {
    const color = 'bg-emerald-600';
    const emoji = FOOD_EMOJIS[foodType] || '📍';
    const content = `<div class="flex flex-col items-center">
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
            <div className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <h1 className="text-[13px] md:text-2xl font-bold tracking-tight text-emerald-900">বিরিয়ানি ডট কম</h1>
                <span className="md:hidden text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">DEV: @SIAMAFRID</span>
              </div>
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
                onChange={(e) => handleSearchSelect(e.target.value)}
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

      <div className="flex-1 flex relative min-h-0">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-80 bg-white border-r border-stone-200 overflow-y-auto p-6 gap-6 min-h-0">
          <div className="flex items-center gap-2 text-stone-500">
            <Info className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">সদর মসজিদের তালিকা</span>
          </div>
          
          <div className="flex flex-col gap-3">
            {filteredMosques.map(m => (
              <motion.button
                key={m.id}
                whileHover={{ x: 4 }}
                onClick={() => goToMosque(m)}
                className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left group ${activeMosque?.id === m.id ? 'border-emerald-500 bg-emerald-50' : 'border-stone-100 hover:border-emerald-200 hover:bg-emerald-50/30'}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-bold text-stone-800 group-hover:text-emerald-900">{m.name}</span>
                  <ChevronRight className={`w-4 h-4 transition-colors ${activeMosque?.id === m.id ? 'text-emerald-500' : 'text-stone-300 group-hover:text-emerald-500'}`} />
                </div>
                <div className="flex items-center justify-between w-full mt-1">
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold uppercase">
                    {m.food_type}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-stone-400">
                    <span className="flex items-center gap-0.5 text-emerald-600"><ThumbsUp className="w-2.5 h-2.5" /> {m.likes}</span>
                    <span className="flex items-center gap-0.5 text-rose-500"><ThumbsDown className="w-2.5 h-2.5" /> {m.dislikes}</span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </aside>

        {/* Map Area */}
        <main className="flex-1 relative min-h-0">
          <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-xl border border-stone-200 shadow-sm flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-emerald-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">ম্যাপে চেপে ধরে নতুন মসজিদ যোগ করুন</span>
          </div>

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
            
            <MapEvents onLongPress={(latlng) => setPendingMosque({ lat: latlng.lat, lng: latlng.lng })} />
            <MapController target={mapTarget} />

            {pendingMosque && (
              <PendingMarker 
                position={pendingMosque}
                onConfirm={() => setIsNamingMosque(true)}
                onCancel={() => setPendingMosque(null)}
              />
            )}

            {filteredMosques.map((mosque) => (
              <Marker 
                key={mosque.id} 
                position={[mosque.lat, mosque.lng]}
                icon={getIcon(mosque.food_type)}
                eventHandlers={{
                  click: () => setActiveMosque(mosque),
                  mousedown: () => {
                    markerTimerRef.current = setTimeout(() => {
                      setIsDeletingMosque(mosque.id);
                      markerTimerRef.current = null;
                    }, 1000);
                  },
                  mouseup: () => {
                    if (markerTimerRef.current) {
                      clearTimeout(markerTimerRef.current);
                      markerTimerRef.current = null;
                    }
                  },
                  touchstart: () => {
                    markerTimerRef.current = setTimeout(() => {
                      setIsDeletingMosque(mosque.id);
                      markerTimerRef.current = null;
                    }, 1000);
                  },
                  touchend: () => {
                    if (markerTimerRef.current) {
                      clearTimeout(markerTimerRef.current);
                      markerTimerRef.current = null;
                    }
                  },
                } as any}
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

        {/* Search Results Modal */}
        <AnimatePresence>
          {isSearchModalOpen && (
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
                className="bg-white rounded-[32px] p-8 w-full max-w-lg shadow-2xl overflow-hidden relative flex flex-col max-h-[80vh]"
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-stone-900 leading-tight">খুঁজে পাওয়া মসজিদসমূহ</h2>
                    <p className="text-stone-500 text-sm">মেনু: <span className="text-emerald-600 font-bold">{filterFood}</span></p>
                  </div>
                  <button 
                    onClick={() => setIsSearchModalOpen(false)}
                    className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                  >
                    <Plus className="w-6 h-6 rotate-45 text-stone-400" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {filteredMosques.length > 0 ? (
                    <div className="grid gap-3">
                      {filteredMosques.map(m => (
                        <button
                          key={m.id}
                          onClick={() => goToMosque(m)}
                          className="flex items-center justify-between p-4 rounded-2xl border border-stone-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition-all text-left"
                        >
                          <div>
                            <span className="block text-sm font-bold text-stone-800">{m.name}</span>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5"><ThumbsUp className="w-2.5 h-2.5" /> {m.likes}</span>
                              <span className="text-[10px] text-rose-500 font-bold flex items-center gap-0.5"><ThumbsDown className="w-2.5 h-2.5" /> {m.dislikes}</span>
                            </div>
                          </div>
                          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-emerald-600" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <p className="text-stone-400 font-bold italic">এই খাবারের কোনো মসজিদ পাওয়া যায়নি</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create Mosque Modal */}
        <AnimatePresence>
          {isNamingMosque && (
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
                <h2 className="text-2xl font-black text-stone-900 mb-2">নতুন মসজিদ যোগ করুন</h2>
                <p className="text-stone-500 text-sm mb-6">মসজিদের সঠিক নাম লিখুন।</p>
                
                <input
                  type="text"
                  placeholder="মসজিদের নাম..."
                  value={newMosqueName}
                  onChange={(e) => setNewMosqueName(e.target.value)}
                  className="w-full p-4 rounded-2xl bg-stone-100 border-2 border-transparent focus:bg-white focus:border-emerald-500 transition-all outline-none mb-6 font-bold"
                  autoFocus
                />
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsNamingMosque(false)}
                    className="flex-1 py-4 text-stone-400 font-bold hover:text-stone-600 transition-colors text-sm"
                  >
                    বাতিল
                  </button>
                  <button
                    onClick={handleCreateMosque}
                    disabled={!newMosqueName.trim() || isCreating}
                    className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isCreating ? 'যোগ হচ্ছে...' : 'মসজিদ যোগ করুন'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Mosque Modal */}
        <AnimatePresence>
          {isDeletingMosque && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2000] bg-rose-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl overflow-hidden relative"
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-rose-500" />
                <h2 className="text-2xl font-black text-stone-900 mb-2">মসজিদ ডিলিট করুন</h2>
                <p className="text-stone-500 text-sm mb-6">ডিলিট করতে সিকিউরিটি কোড দিন।</p>
                
                <input
                  type="password"
                  placeholder="কোড দিন..."
                  value={deleteCode}
                  onChange={(e) => setDeleteCode(e.target.value)}
                  className="w-full p-4 rounded-2xl bg-stone-100 border-2 border-transparent focus:bg-white focus:border-rose-500 transition-all outline-none mb-6 font-bold text-center tracking-widest"
                  autoFocus
                />
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsDeletingMosque(null);
                      setDeleteCode('');
                    }}
                    className="flex-1 py-4 text-stone-400 font-bold hover:text-stone-600 transition-colors text-sm"
                  >
                    বাতিল
                  </button>
                  <button
                    onClick={handleDeleteMosque}
                    disabled={deleteCode !== '1311'}
                    className="flex-[2] bg-rose-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all disabled:opacity-50"
                  >
                    ডিলিট করুন
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                      className="group relative p-6 rounded-3xl border-2 border-stone-100 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-center flex flex-col items-center gap-2"
                    >
                      <span className="text-2xl">{FOOD_EMOJIS[food]}</span>
                      <span className="block text-sm font-bold text-stone-800 group-hover:text-emerald-900">{food}</span>
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
        <p className="hidden md:block text-emerald-600">Developer: @SIAMAFRID</p>
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

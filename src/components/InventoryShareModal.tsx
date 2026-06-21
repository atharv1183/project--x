import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, MessageSquare, Share2, ExternalLink, List, Grid } from 'lucide-react';
import { InventoryItem } from '../types';

interface InventoryShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  userPhone: string;
}

export default function InventoryShareModal({ isOpen, onClose, item, userPhone }: InventoryShareModalProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  if (!item) return null;

  const isProject = item.listingMode === 'project' || item.isProject;
  
  // Base URLs
  const baseUrl = `${window.location.origin}/p/${item.id}`;
  const refQuery = userPhone ? `?ref=${encodeURIComponent(userPhone)}` : '';
  const shareUrl = `${baseUrl}${refQuery}`;
  const listViewUrl = `${baseUrl}${refQuery}${refQuery ? '&' : '?'}view=list`;
  const gridViewUrl = `${baseUrl}${refQuery}${refQuery ? '&' : '?'}view=icon`;

  // Get Map Link
  const getMapLink = () => {
    if (item.locationLink) return item.locationLink;
    if (item.latitude && item.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`;
    }
    return '';
  };

  // Get Primary Area Label
  const getAreaText = () => {
    if (item.areaValue) {
      return `${Number(item.areaValue).toLocaleString()} ${item.areaUnit || ''}`;
    }
    return '';
  };

  // Get specs text (e.g. Duplex • 3 BHK)
  const getSpecsText = () => {
    const specs: string[] = [];
    if (item.houseType) specs.push(item.houseType.replace('-', ' '));
    if (item.bhk) specs.push(`${item.bhk} BHK`);
    if (item.bathrooms) specs.push(`${item.bathrooms} Bath`);
    return specs.length > 0 ? `🏡 ${specs.join(' • ')}` : '';
  };

  // Build Formatted Message
  const buildMessage = (mode?: 'list' | 'grid') => {
    const mapLink = getMapLink();
    const areaText = getAreaText();
    const specsText = getSpecsText();
    
    if (isProject) {
      const unitsText = item.projectUnitCount || item.projectUnits?.length || 0;
      let linkSection = '';
      if (mode === 'list') {
        linkSection = `📸 View Project List Layout:\n🔗 ${listViewUrl}`;
      } else if (mode === 'grid') {
        linkSection = `📸 View Project Grid Layout:\n🔗 ${gridViewUrl}`;
      } else {
        linkSection = `📸 View Project Photos & Unit Options:\n🔗 ${shareUrl}`;
      }

      return [
        `🏢 *${item.title}*`,
        '',
        `📍 Location: ${item.location || 'N/A'}`,
        `📐 Units Available: ${unitsText}`,
        '💰 Rates: Call for details',
        '',
        linkSection,
        '',
        mapLink ? `📌 Google Maps:\n🔗 ${mapLink}\n` : '',
        '━━━━━━━━━━━━━━━',
        'Shared via EstatePlus CRM'
      ].filter(val => val !== undefined && val !== null).join('\n');
    } else {
      const priceText = `Rs ${Number(item.rate || 0).toLocaleString()} ${item.rateUnit ? `(${item.rateUnit})` : ''}`;
      return [
        `🏠 *${item.title}*`,
        '',
        `📍 Location: ${item.location || 'N/A'}`,
        `📐 Size: ${areaText || 'N/A'} | 💰 Price: ${priceText}`,
        specsText,
        '',
        `📸 View Photos & Details:\n🔗 ${shareUrl}`,
        '',
        mapLink ? `📌 Google Maps:\n🔗 ${mapLink}\n` : '',
        item.videos?.length ? '🎬 Video Tour Available\n' : '',
        '━━━━━━━━━━━━━━━',
        'Shared via EstatePlus CRM'
      ].filter(val => val !== undefined && val !== null).join('\n');
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLink(label);
      setTimeout(() => setCopiedLink(null), 2000);
    });
  };

  const handleWhatsApp = (mode?: 'list' | 'grid') => {
    const text = buildMessage(mode);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: `Check out ${item.title} in ${item.location}`,
          url: shareUrl,
        });
      } catch (err) {
        console.warn('Native share failed', err);
      }
    } else {
      handleCopy(shareUrl, 'main');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          {/* Backdrop Click */}
          <motion.div 
            className="absolute inset-0 cursor-default" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div 
            className="relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden z-10 max-h-[92vh] sm:max-h-[90vh] flex flex-col"
            initial={{ y: '100%', opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.5 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Share Listing</h3>
                <p className="text-xs text-slate-500 truncate max-w-[320px] mt-0.5">{item.title}</p>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-5 overflow-y-auto space-y-6">
              
              {/* Primary Actions Grid */}
              <div className="grid grid-cols-3 gap-3">
                <button 
                  onClick={() => handleWhatsApp()}
                  className="flex flex-col items-center justify-center p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/50 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 rounded-2xl text-emerald-700 dark:text-emerald-400 transition-all active:scale-95 cursor-pointer"
                >
                  <MessageSquare size={24} className="mb-2" />
                  <span className="text-xs font-bold">WhatsApp</span>
                </button>

                <button 
                  onClick={handleNativeShare}
                  className="flex flex-col items-center justify-center p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-950/40 rounded-2xl text-blue-700 dark:text-blue-400 transition-all active:scale-95 cursor-pointer"
                >
                  <Share2 size={24} className="mb-2" />
                  <span className="text-xs font-bold">Native Share</span>
                </button>

                <button 
                  onClick={() => handleCopy(shareUrl, 'main')}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-2xl text-slate-700 dark:text-slate-300 transition-all active:scale-95 cursor-pointer"
                >
                  {copiedLink === 'main' ? (
                    <Check size={24} className="mb-2 text-green-500" />
                  ) : (
                    <Copy size={24} className="mb-2" />
                  )}
                  <span className="text-xs font-bold">{copiedLink === 'main' ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>

              {/* URL Preview / Copy Row */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/60 rounded-xl flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-slate-500 dark:text-slate-400 flex-1 select-all">{shareUrl}</span>
                <button 
                  onClick={() => handleCopy(shareUrl, 'main')}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-500 font-bold shrink-0 inline-flex items-center gap-1"
                >
                  {copiedLink === 'main' ? 'Copied' : 'Copy'}
                </button>
              </div>

              {/* Project Layout Share Options */}
              {isProject && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Share Project View Layouts</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    
                    {/* List View Option */}
                    <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                          <List size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">List Layout Link</p>
                          <p className="text-[10px] text-slate-500">Public unit table view</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button 
                          onClick={() => handleWhatsApp('list')}
                          className="flex-1 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-xl text-emerald-700 dark:text-emerald-400 text-[10px] font-bold transition-all"
                        >
                          WhatsApp
                        </button>
                        <button 
                          onClick={() => handleCopy(listViewUrl, 'list')}
                          className="flex-1 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-700 dark:text-slate-300 text-[10px] font-bold transition-all"
                        >
                          {copiedLink === 'list' ? 'Copied!' : 'Copy Link'}
                        </button>
                      </div>
                    </div>

                    {/* Grid/Icon View Option */}
                    <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                          <Grid size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Grid Layout Link</p>
                          <p className="text-[10px] text-slate-500">Public unit grid cards view</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button 
                          onClick={() => handleWhatsApp('grid')}
                          className="flex-1 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-xl text-emerald-700 dark:text-emerald-400 text-[10px] font-bold transition-all"
                        >
                          WhatsApp
                        </button>
                        <button 
                          onClick={() => handleCopy(gridViewUrl, 'grid')}
                          className="flex-1 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-700 dark:text-slate-300 text-[10px] font-bold transition-all"
                        >
                          {copiedLink === 'grid' ? 'Copied!' : 'Copy Link'}
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Toggle WhatsApp Message Preview */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <button 
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full py-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all"
                >
                  <span>{showPreview ? 'Hide Message Preview' : 'Show WhatsApp Message Preview'}</span>
                  <ExternalLink size={12} />
                </button>
                
                {showPreview && (
                  <div className="mt-3 p-4 bg-[#ece5dd] dark:bg-slate-950/80 border border-slate-200 dark:border-slate-900 text-slate-800 dark:text-slate-300 rounded-2xl font-mono text-[11px] whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed shadow-inner">
                    {buildMessage()}
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-center text-[10px] text-slate-500">
              Open WhatsApp option generates a fully formatted text with direct click-to-view link.
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

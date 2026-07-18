import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { InventoryItem, ProjectUnit } from '../types';
import { 
  MapPin, Bed, Bath, Layers, Grid, List, Share2, Compass, 
  ChevronLeft, ChevronRight, Phone, MessageSquare, Check, 
  ExternalLink, Home, ArrowLeft, ImageIcon, Video as VideoIcon,
  ScanLine
} from 'lucide-react';
import PanoramaViewer from '../components/PanoramaViewer';

interface PropertyDetailPageProps {
  propertyId: string;
}

export default function PropertyDetailPage({ propertyId }: PropertyDetailPageProps) {
  const [property, setProperty] = useState<InventoryItem | null>(null);
  const [branding, setBranding] = useState<{ logoUrl: string; companyName: string; tagline: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [selectedBhkFilter, setSelectedBhkFilter] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const [showTour, setShowTour] = useState(false);

  // Read referrer phone from URL queries
  const searchParams = new URLSearchParams(window.location.search);
  const referrerPhone = searchParams.get('ref') || '';
  const initialViewParam = searchParams.get('view') || '';

  useEffect(() => {
    if (initialViewParam === 'list' || initialViewParam === 'icon') {
      setViewMode(initialViewParam === 'list' ? 'list' : 'grid');
    }
  }, [initialViewParam]);

  useEffect(() => {
    async function loadPropertyAndBranding() {
      if (!propertyId) {
        setError('No property ID provided in URL.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Load Property
        const propRef = doc(db, 'inventory', propertyId);
        const propDoc = await getDoc(propRef);

        if (!propDoc.exists()) {
          setError('Property not found or may have been removed.');
          setLoading(false);
          return;
        }

        const propData = { id: propDoc.id, ...propDoc.data() } as InventoryItem;
        
        if (propData.status !== 'approved') {
          setError('This listing is not currently active.');
          setLoading(false);
          return;
        }

        setProperty(propData);

        // Load Client Branding if property has clientId
        if (propData.clientId) {
          const brandRef = doc(db, 'clientBranding', propData.clientId);
          const brandDoc = await getDoc(brandRef);
          if (brandDoc.exists()) {
            const data = brandDoc.data();
            setBranding({
              logoUrl: data.logoUrl || '',
              companyName: data.companyName || 'EstatePulse Client',
              tagline: data.tagline || '',
            });
          }
        }
      } catch (err: any) {
        console.error('Error fetching public property page data:', err);
        setError('An error occurred while loading this listing. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadPropertyAndBranding();
  }, [propertyId]);

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = property?.title || 'Check out this property';
    const shareText = `View photos, pricing, and project details for ${property?.title} in ${property?.location}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.warn('Native share failed, falling back to copy link', err);
        copyToClipboard(shareUrl);
      }
    } else {
      copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsAppEnquiry = () => {
    if (!property) return;
    
    // Choose which number to open the chat with:
    // 1. Referrer agent phone from URL query param
    // 2. Broker phone from property data
    // 3. Fallback blank (user selects contact)
    let contactNumber = referrerPhone || property.brokerPhone || '';
    
    // Normalize contact number: strip non-digits, ensure country code
    contactNumber = contactNumber.replace(/\D/g, '');
    if (contactNumber.length === 10) {
      contactNumber = `91${contactNumber}`; // default to Indian code if 10 digits
    }

    const titleText = property.title;
    const priceText = property.listingMode === 'project' 
      ? 'Starting Price' 
      : `Rs ${Number(property.rate || 0).toLocaleString()} ${property.rateUnit ? `(${property.rateUnit})` : ''}`;
    
    const message = `Hi! I'm interested in your property listing:
*${titleText}*
📍 Location: ${property.location || 'N/A'}
💰 Price: ${priceText}
🔗 Link: ${window.location.origin}/p/${property.id}

Please share more details with me. Thank you!`;

    const whatsappUrl = `https://wa.me/${contactNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const getInventoryTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      zameen: 'Zameen / Land',
      house: 'House / Villa',
      plot: 'Residential Plot',
      others: 'Commercial / Others',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
        {/* Loading Header */}
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10 px-4 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between animate-pulse">
            <div className="w-32 h-6 bg-slate-800 rounded"></div>
            <div className="w-24 h-8 bg-slate-800 rounded-full"></div>
          </div>
        </header>

        {/* Loading Body Skeleton */}
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 space-y-6">
          <div className="w-full aspect-[16/9] md:aspect-[21/9] bg-slate-900 animate-pulse rounded-3xl"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="h-8 bg-slate-900 rounded w-3/4 animate-pulse"></div>
              <div className="h-4 bg-slate-900 rounded w-1/2 animate-pulse"></div>
              <div className="h-32 bg-slate-900 rounded animate-pulse"></div>
            </div>
            <div className="space-y-4">
              <div className="h-48 bg-slate-900 rounded-3xl animate-pulse"></div>
            </div>
          </div>
        </main>

        <footer className="py-8 bg-slate-900 border-t border-slate-800 text-center text-slate-500 animate-pulse">
          <div className="w-40 h-4 bg-slate-800 mx-auto rounded"></div>
        </footer>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-red-950 border border-red-800 text-red-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold">Listing Unavailable</h2>
          <p className="text-slate-400 text-sm">{error || 'This listing could not be found.'}</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            <Home size={16} />
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  const isProject = property.listingMode === 'project' || property.isProject;
  const photos = property.photos || [];
  const videos = property.videos || [];
  
  // Extract project units filtered by BHK if applicable
  const projectUnits = property.projectUnits || [];
  const uniqueBhks = Array.from(new Set(projectUnits.map(u => u.bhk).filter(Boolean))) as number[];
  const sortedBhks = uniqueBhks.sort((a, b) => a - b);

  const filteredUnits = projectUnits.filter(unit => {
    if (selectedBhkFilter === 'all') return true;
    return unit.bhk === Number(selectedBhkFilter);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Premium Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="h-9 w-9 object-contain rounded-lg bg-slate-900 p-1" />
            ) : (
              <div className="h-9 w-9 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-sm">
                EP
              </div>
            )}
            <div>
              <p className="font-bold text-sm leading-tight text-white">{branding?.companyName || 'EstatePulse'}</p>
              {branding?.tagline && <p className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">{branding.tagline}</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleShare}
              className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 rounded-xl text-slate-300 transition-all flex items-center gap-1.5 text-xs font-semibold"
              title="Share listing"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
            </button>
            <button 
              onClick={handleWhatsAppEnquiry}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 transition-all"
            >
              <MessageSquare size={14} />
              Enquire Now
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 space-y-8 pb-20">
        
        {/* Photo/Video Carousel Section */}
        <section
          className="relative rounded-3xl overflow-hidden border border-slate-900 bg-slate-900/40 aspect-[16/10] md:aspect-[21/9] flex items-center justify-center group"
          onClick={() => {
            if ((property.panoramaPhotos?.length ?? 0) > 0) setShowTour(true);
          }}
          style={{ cursor: (property.panoramaPhotos?.length ?? 0) > 0 ? 'pointer' : 'default' }}
        >
          {photos.length > 0 ? (
            <img 
              src={photos[activePhotoIndex]} 
              alt={`Property image ${activePhotoIndex + 1}`} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 space-y-2">
              <ImageIcon size={48} />
              <p className="text-sm font-semibold">No Property Photos Available</p>
            </div>
          )}
          
          {/* Carousel Dark Overlay Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent pointer-events-none"></div>

          {/* 360 Tour Badge — only when panos exist */}
          {(property.panoramaPhotos?.length ?? 0) > 0 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center justify-center">
                  <ScanLine size={28} className="text-blue-400" />
                </div>
                <span className="px-3 py-1 bg-black/70 backdrop-blur-md border border-white/10 rounded-full text-white text-xs font-bold tracking-wide">
                  View 360° Tour
                </span>
              </div>
            </div>
          )}

          {/* Carousel Controls — stop propagation so arrows don't open tour */}
          {photos.length > 1 && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1)); }}
                className="absolute left-4 p-2.5 rounded-full bg-slate-950/70 border border-slate-800/80 text-white hover:bg-slate-900 transition-all z-20"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1)); }}
                className="absolute right-4 p-2.5 rounded-full bg-slate-950/70 border border-slate-800/80 text-white hover:bg-slate-900 transition-all z-20"
              >
                <ChevronRight size={20} />
              </button>
              
              {/* Carousel Dot Indicators */}
              <div className="absolute bottom-4 flex gap-1.5 justify-center w-full z-20" onClick={(e) => e.stopPropagation()}>
                {photos.map((_, index) => (
                  <button 
                    key={index} 
                    onClick={() => setActivePhotoIndex(index)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${index === activePhotoIndex ? 'w-6 bg-blue-500' : 'w-1.5 bg-slate-500/50'}`}
                  ></button>
                ))}
              </div>
            </>
          )}

          {/* Tag Badges */}
          <div className="absolute top-4 left-4 flex gap-2 z-20" onClick={(e) => e.stopPropagation()}>
            <span className="px-3 py-1 bg-blue-600/90 text-white text-[10px] font-bold tracking-wider uppercase rounded-full shadow-lg">
              {getInventoryTypeLabel(property.type)}
            </span>
            {property.subType && (
              <span className="px-3 py-1 bg-slate-800/90 text-slate-200 text-[10px] font-bold tracking-wider uppercase rounded-full shadow-lg">
                {property.subType}
              </span>
            )}
            {(property.panoramaPhotos?.length ?? 0) > 0 && (
              <span className="px-3 py-1 bg-blue-900/90 border border-blue-700/50 text-blue-200 text-[10px] font-bold tracking-wider uppercase rounded-full shadow-lg flex items-center gap-1">
                <ScanLine size={10} />
                360° Tour
              </span>
            )}
          </div>
        </section>

        {/* 360 Tour Banner — persistent button shown below carousel when panos exist */}
        {(property.panoramaPhotos?.length ?? 0) > 0 && (
          <button
            onClick={() => setShowTour(true)}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-blue-950/80 to-indigo-950/80 border border-blue-800/40 rounded-2xl text-blue-300 hover:text-white hover:border-blue-600/60 hover:from-blue-900/80 hover:to-indigo-900/80 active:scale-[0.99] transition-all group"
          >
            <ScanLine size={18} className="text-blue-400 group-hover:animate-spin" style={{ animationDuration: '3s' }} />
            <span className="text-sm font-bold tracking-wide">Open Interior 360° Tour</span>
            <span className="text-[10px] font-semibold text-blue-400/70">{property.panoramaPhotos!.length} room{property.panoramaPhotos!.length > 1 ? 's' : ''}</span>
          </button>
        )}

        {/* Panorama Viewer Modal */}
        <PanoramaViewer
          isOpen={showTour}
          onClose={() => setShowTour(false)}
          panoramaPhotos={property.panoramaPhotos || []}
          panoramaLabels={property.panoramaLabels || []}
        />

        {/* Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Main Info Columns */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Title & Core Meta */}
            <div className="space-y-4">
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{property.title}</h1>
              
              <div className="flex flex-wrap gap-3 items-center text-sm text-slate-400">
                <span className="flex items-center gap-1">
                  <MapPin size={16} className="text-red-500" />
                  {property.location}
                </span>
                
                {property.locationLink && (
                  <a 
                    href={property.locationLink}
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Compass size={14} />
                    <span>View Map</span>
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>

            {/* Price & Primary Size Panel */}
            <div className="grid grid-cols-2 gap-4 p-5 rounded-3xl border border-slate-900 bg-slate-900/30">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Pricing</p>
                <p className="text-xl md:text-2xl font-black text-white mt-1">
                  {isProject 
                    ? 'Call for Pricing' 
                    : `₹${Number(property.rate || 0).toLocaleString()}`}
                </p>
                {!isProject && property.rateUnit && (
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">Rate: {property.rateUnit.replace('_', ' ')}</p>
                )}
              </div>
              
              <div>
                <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Primary Area</p>
                <p className="text-xl md:text-2xl font-black text-white mt-1">
                  {property.areaValue ? `${Number(property.areaValue).toLocaleString()} ${property.areaUnit || ''}` : 'N/A'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Listed Property Size</p>
              </div>
            </div>

            {/* Key Specs Row */}
            {!isProject && (property.bhk || property.bathrooms || property.houseType) && (
              <div className="flex flex-wrap gap-6 border-y border-slate-900 py-5">
                {property.bhk && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-blue-400">
                      <Bed size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Beds</p>
                      <p className="text-sm font-bold text-white">{property.bhk} BHK</p>
                    </div>
                  </div>
                )}
                
                {property.bathrooms && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-blue-400">
                      <Bath size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Bathrooms</p>
                      <p className="text-sm font-bold text-white">{property.bathrooms} Baths</p>
                    </div>
                  </div>
                )}
                
                {property.houseType && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-blue-400">
                      <Layers size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">House Type</p>
                      <p className="text-sm font-bold text-white capitalize">{property.houseType.replace('-', ' ')}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {property.description && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white">About the Property</h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{property.description}</p>
              </div>
            )}

            {/* Features / Amenities */}
            {property.features && property.features.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white">Amenities & Features</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {property.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-slate-300 bg-slate-900/30 border border-slate-900 px-3.5 py-2.5 rounded-xl">
                      <Check size={14} className="text-emerald-500 shrink-0" />
                      <span className="truncate">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Video Section */}
            {videos.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white">Video Tour</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videos.map((vidUrl, i) => {
                    const isDirect = /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(vidUrl);
                    return (
                      <div key={i} className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video border border-slate-800">
                        {isDirect ? (
                          <video src={vidUrl} controls className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center space-y-3">
                            <VideoIcon size={32} className="text-blue-500" />
                            <div>
                              <p className="text-xs font-semibold">Video Link Available</p>
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]">{vidUrl}</p>
                            </div>
                            <a 
                              href={vidUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 shadow-sm transition-all"
                            >
                              <span>Watch Video</span>
                              <ExternalLink size={10} />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photo Gallery Grid */}
            {photos.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white">Photo Gallery</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photos.map((photo, i) => (
                    <button 
                      key={i} 
                      onClick={() => setActivePhotoIndex(i)}
                      className={`relative aspect-[4/3] rounded-2xl overflow-hidden border transition-all ${i === activePhotoIndex ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-900 hover:border-slate-800'}`}
                    >
                      <img src={photo} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Sidebar Area */}
          <div className="space-y-6">
            
            {/* Agent / Inquiry Card */}
            <div className="p-6 rounded-3xl border border-slate-900 bg-slate-900/20 space-y-5">
              <h3 className="text-md font-bold text-white">Interested in this property?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Connect directly with the listing agent to ask questions, schedule a physical visit, or make an offer.
              </p>
              
              <div className="space-y-2">
                <button 
                  onClick={handleWhatsAppEnquiry}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 transition-all cursor-pointer"
                >
                  <MessageSquare size={16} />
                  Enquire via WhatsApp
                </button>
                
                {referrerPhone && (
                  <a 
                    href={`tel:${referrerPhone}`}
                    className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Phone size={16} />
                    Call Agent
                  </a>
                )}
              </div>

              {property.brokerName && (
                <div className="border-t border-slate-900 pt-4 text-xs space-y-1">
                  <p className="text-slate-500 font-semibold uppercase tracking-wider text-[9px]">Direct Broker Contact</p>
                  <p className="font-bold text-slate-200">{property.brokerName}</p>
                  {property.brokerPhone && <p className="text-slate-400">{property.brokerPhone}</p>}
                </div>
              )}
            </div>

            {/* Quick Details Sidebar Card */}
            <div className="p-6 rounded-3xl border border-slate-900 bg-slate-900/20 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Listing Details</h4>
              <div className="space-y-3 text-xs">
                {property.landmark && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Landmark:</span>
                    <span className="font-semibold text-slate-300 text-right">{property.landmark}</span>
                  </div>
                )}
                {property.nearbyLocation && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Nearby Location:</span>
                    <span className="font-semibold text-slate-300 text-right">{property.nearbyLocation}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Listing Mode:</span>
                  <span className="font-semibold text-slate-300 capitalize">{isProject ? 'Project' : 'Individual Listing'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Posted on:</span>
                  <span className="font-semibold text-slate-300">
                    {property.createdAt?.toDate ? property.createdAt.toDate().toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Project Units Section (Only for Projects) */}
        {isProject && projectUnits.length > 0 && (
          <section className="border-t border-slate-900 pt-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white">Project Units & Inventory</h2>
                <p className="text-xs text-slate-400 mt-1">Browse available options in this project layout</p>
              </div>
              
              <div className="flex items-center gap-2 self-start">
                {/* BHK Filters */}
                {sortedBhks.length > 0 && (
                  <select 
                    value={selectedBhkFilter}
                    onChange={(e) => setSelectedBhkFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none"
                  >
                    <option value="all">All BHKs</option>
                    {sortedBhks.map(bhk => (
                      <option key={bhk} value={bhk}>{bhk} BHK</option>
                    ))}
                  </select>
                )}

                {/* View Mode Toggle Buttons */}
                <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-0.5">
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Grid view"
                  >
                    <Grid size={15} />
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="List view"
                  >
                    <List size={15} />
                  </button>
                </div>
              </div>
            </div>

            {filteredUnits.length === 0 ? (
              <div className="p-8 border border-slate-900 rounded-3xl bg-slate-900/10 text-center text-slate-500">
                No units match the selected criteria.
              </div>
            ) : viewMode === 'list' ? (
              /* LIST VIEW */
              <div className="border border-slate-900 rounded-3xl overflow-hidden bg-slate-900/10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900 text-slate-400 font-bold bg-slate-900/30">
                        <th className="p-4">Unit Details</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Size</th>
                        <th className="p-4">Price</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {filteredUnits.map((unit) => (
                        <tr key={unit.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {unit.photos && unit.photos.length > 0 ? (
                                <img src={unit.photos[0]} alt={unit.title} className="w-12 h-9 object-cover rounded-lg bg-slate-950" />
                              ) : (
                                <div className="w-12 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-slate-500">
                                  <ImageIcon size={14} />
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-slate-200">{unit.title || 'Unit Option'}</p>
                                {unit.bhk ? <p className="text-[10px] text-slate-400">{unit.bhk} BHK</p> : null}
                              </div>
                            </div>
                          </td>
                          <td className="p-4 capitalize text-slate-300">
                            {unit.type} {unit.subType ? `(${unit.subType})` : ''}
                          </td>
                          <td className="p-4 text-slate-300 font-medium">
                            {unit.areaValue ? `${Number(unit.areaValue).toLocaleString()} ${unit.areaUnit || ''}` : '-'}
                          </td>
                          <td className="p-4 font-bold text-slate-200">
                            ₹{Number(unit.rate || 0).toLocaleString()}
                          </td>
                          <td className="p-4 text-right">
                            <button 
                              onClick={handleWhatsAppEnquiry}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-lg text-[10px] inline-flex items-center gap-1 transition-all"
                            >
                              <MessageSquare size={10} />
                              Enquire
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* GRID / ICON VIEW */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {filteredUnits.map((unit) => (
                  <div key={unit.id} className="group rounded-3xl border border-slate-900 bg-slate-900/10 hover:border-slate-800/80 transition-all overflow-hidden flex flex-col justify-between">
                    
                    {/* Unit Image */}
                    <div className="relative aspect-[4/3] bg-slate-950">
                      {unit.photos && unit.photos.length > 0 ? (
                        <img 
                          src={unit.photos[0]} 
                          alt={unit.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                          <ImageIcon size={32} />
                        </div>
                      )}
                      
                      {unit.bhk && (
                        <span className="absolute top-3 left-3 px-2 py-0.5 bg-slate-950/70 border border-slate-800 text-slate-200 text-[10px] font-bold rounded-lg">
                          {unit.bhk} BHK
                        </span>
                      )}
                    </div>
                    
                    {/* Unit Info */}
                    <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-200 truncate">{unit.title || 'Unit Layout'}</h4>
                        <div className="flex gap-2 text-xs text-slate-400">
                          <span className="capitalize">{unit.type}</span>
                          <span>•</span>
                          <span>{unit.areaValue ? `${Number(unit.areaValue).toLocaleString()} ${unit.areaUnit || ''}` : '-'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between gap-3 border-t border-slate-900 pt-3 mt-1">
                        <div>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Price</p>
                          <p className="text-sm font-black text-white">₹{Number(unit.rate || 0).toLocaleString()}</p>
                        </div>
                        <button 
                          onClick={handleWhatsAppEnquiry}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1 transition-all"
                        >
                          <MessageSquare size={12} />
                          Enquire
                        </button>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </main>

      {/* Premium Footer */}
      <footer className="py-12 bg-slate-950 border-t border-slate-900 text-center text-slate-500 mt-auto">
        <div className="max-w-6xl mx-auto px-4 space-y-4">
          <div className="flex items-center justify-center gap-2 text-slate-300 font-bold text-sm">
            <span>Powered by</span>
            <span className="text-blue-500 font-black">EstatePulse CRM</span>
          </div>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            This is a secure public property listing page shared directly by a verified real estate agent. All details are stored and managed via EstatePulse CRM.
          </p>
          <p className="text-[10px] text-slate-700">
            © {new Date().getFullYear()} EstatePulse. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc,
  serverTimestamp, 
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  InventoryItem, 
  InventoryType, 
  HouseType, 
  InventoryStatus, 
  ListingMode,
  InventoryVisibility,
  ProjectUnit,
  Broker,
  User, 
  OperationType 
} from '../types';
import { handleFirestoreError, cn, convertArea, AREA_CONVERSIONS } from '../lib/utils';
import { addAuditLog } from '../lib/audit';
import InventoryShareModal from './InventoryShareModal';
import { 
  Plus, 
  Search, 
  Image as ImageIcon, 
  File, 
  Check, 
  X, 
  Trash2, 
  Edit2, 
  MapPin, 
  Home, 
  Landmark,
  Upload,
  ChevronDown,
  Info,
  Share2,
  Clock,
  LayoutGrid,
  FileCheck,
  FileText,
  Film,
  Link2,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface InventoryManagementProps {
  user: User;
  onBack?: () => void;
}

function toMillis(value: unknown): number {
  if (!value) return 0;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }

  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };

    if (typeof maybeTimestamp.toDate === 'function') {
      const parsed = maybeTimestamp.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0;
    }

    if (typeof maybeTimestamp.seconds === 'number') {
      return maybeTimestamp.seconds * 1000;
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

function RequiredLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      {children} <span className="text-rose-500">*</span>
    </label>
  );
}

function normalizeVideoLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeLocationLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildGoogleMapsLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function getInventoryLocationLink(item: InventoryItem) {
  return item.locationLink || buildGoogleMapsLink(item.latitude, item.longitude);
}

function parseCoordinatesFromMapLink(value: string): { latitude: number; longitude: number } | null {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /!4d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];

  for (let index = 0; index < patterns.length; index += 1) {
    const pattern = patterns[index];
    const match = decoded.match(pattern);
    if (!match) continue;
    const latitude = Number(index === 3 ? match[2] : match[1]);
    const longitude = Number(index === 3 ? match[1] : match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return { latitude, longitude };
    }
  }

  return null;
}

function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?(#.*)?$/i.test(url)
    || /res\.cloudinary\.com\/.+\/video\/upload/i.test(url);
}

function getVideoLinkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Video link';
  }
}

function buildProjectViewLink(itemId: string, view: 'list' | 'icon'): string {
  const url = new URL('/website', window.location.origin);
  url.searchParams.set('project', itemId);
  url.searchParams.set('view', view);
  return url.toString();
}

export default function InventoryManagement({ user, onBack }: InventoryManagementProps) {
  const isAdmin = user.role === 'super_admin' || user.role === 'admin' || user.role === 'client_admin' || user.role === 'manager';
  const isSuperAdmin = user.role === 'super_admin' || user.role === 'admin' || user.role === 'client_admin';
  const [tenantClientId, setTenantClientId] = useState<string>(String((user as any).clientId || ''));
  const shouldScopeByClient = user.role !== 'super_admin' && tenantClientId.length > 0;
  const requiresTenantContext = user.role !== 'super_admin';
  type AreaUnit = keyof typeof AREA_CONVERSIONS;
  type ProjectUnitDraft = Omit<ProjectUnit, 'areaValue' | 'rate' | 'bhk' | 'bathrooms'> & {
    newPhotos: File[];
    areaValue: string | number;
    rate: string | number;
    bhk: string | number;
    bathrooms: string | number;
  };

  const createProjectUnitDraft = (): ProjectUnitDraft => ({
    id: `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    type: 'house',
    subType: 'new',
    areaValue: '',
    areaUnit: 'sqft',
    areaAcre: 0,
    areaSqft: 0,
    areaSqYard: 0,
    areaSqMtr: 0,
    areaHectare: 0,
    rate: '',
    rateUnit: 'total',
    houseType: 'simplex',
    bhk: '',
    bathrooms: '',
    kitchenType: '',
    photos: [],
    newPhotos: [],
  });

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedShareItem, setSelectedShareItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'approved' | 'non_approved' | 'pending' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState({
    state: '',
    city: '',
    area: '',
    minBudget: '',
    maxBudget: '',
    minSize: '',
    maxSize: '',
  });

  // Form State
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    brokerId: '',
    visibilityScope: 'internal' as InventoryVisibility,
    listingMode: 'single' as ListingMode,
    type: 'house' as InventoryType,
    areaValue: '' as string | number,
    areaUnit: 'sqft' as AreaUnit,
    subType: 'new',
    approvalStatus: 'non_approved' as 'approved' | 'non_approved',
    rate: '' as string | number,
    rateUnit: 'total',
    location: '',
    nearbyLocation: '',
    landmark: '',
    locationLink: '',
    houseType: 'simplex' as HouseType,
    bhk: '' as string | number,
    bathrooms: '' as string | number,
    kitchenType: '',
    features: [] as string[],
    newFeature: '',
    projectUnits: [createProjectUnitDraft()] as ProjectUnitDraft[],
    latitude: 20.5937 as number, // Default India center
    longitude: 78.9629 as number
  });

  const cloudinaryCloudName = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
  const cloudinaryUploadPreset = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();
  const hasCloudinaryConfig = cloudinaryCloudName.length > 0 && cloudinaryUploadPreset.length > 0;

  const [files, setFiles] = useState<{ photos: File[], videos: File[], attachments: File[] }>({
    photos: [],
    videos: [],
    attachments: []
  });
  const [videoLinks, setVideoLinks] = useState<string[]>([]);
  const [videoLinkInput, setVideoLinkInput] = useState('');
  const tenantAlertShownRef = useRef(false);
  const [formNotice, setFormNotice] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const sanitizeBackupData = (value: unknown): unknown => {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      return ((value as { toDate: () => Date }).toDate()).toISOString();
    }
    if (Array.isArray(value)) return value.map(sanitizeBackupData);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeBackupData(item)])
    );
  };

  const writeInventoryBackup = async (inventoryId: string, action: string, snapshot: Record<string, unknown>) => {
    try {
      await addDoc(collection(db, 'inventoryBackups'), {
        inventoryId,
        action,
        clientId: String(snapshot.clientId || tenantClientId || ''),
        clientName: String(snapshot.clientName || (user as any).clientName || ''),
        title: String(snapshot.title || ''),
        snapshot: sanitizeBackupData(snapshot),
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn('Could not write inventory backup', error);
    }
  };

  useEffect(() => {
    let mounted = true;
    const hydrateTenantContext = async () => {
      const fromSession = String((user as any).clientId || '');
      if (fromSession) {
        if (mounted) setTenantClientId(fromSession);
        return;
      }
      if (user.role === 'super_admin' || !auth.currentUser) {
        if (mounted) setTenantClientId('');
        return;
      }
      try {
        const latestUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const latestClientId = latestUserDoc.exists() ? String((latestUserDoc.data() as any)?.clientId || '') : '';
        if (mounted) setTenantClientId(latestClientId);
      } catch {
        if (mounted) setTenantClientId('');
      }
    };
    void hydrateTenantContext();
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (requiresTenantContext && !tenantClientId) {
      setItems([]);
      if (!tenantAlertShownRef.current) {
        setFormNotice({ type: 'error', message: 'Your account is missing company mapping. Please contact super admin.' });
        tenantAlertShownRef.current = true;
      }
      return;
    }
    tenantAlertShownRef.current = false;

    let unsubscribeApproved: () => void;
    let unsubscribePersonal: () => void;
    
    if (isAdmin) {
      const q = shouldScopeByClient
        ? query(collection(db, 'inventory'), where('clientId', '==', tenantClientId))
        : query(collection(db, 'inventory'), orderBy('createdAt', 'desc'));
      unsubscribeApproved = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem))
          .filter(item => !(item as any).deletedAt)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setItems(data);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'inventory'));
      return () => unsubscribeApproved();
    } else {
      // For employees, we need two separate listeners to satisfy security rules 
      // which block broad listing of all items (including others' drafts).
      
      const qApproved = shouldScopeByClient
        ? query(collection(db, 'inventory'), where('status', '==', 'approved'), where('clientId', '==', tenantClientId))
        : query(collection(db, 'inventory'), where('status', '==', 'approved'));
      
      const qPersonal = shouldScopeByClient
        ? query(collection(db, 'inventory'), where('submitterId', '==', user.uid), where('clientId', '==', tenantClientId))
        : query(collection(db, 'inventory'), where('submitterId', '==', user.uid));

      const approvedItems: InventoryItem[] = [];
      const personalItems: InventoryItem[] = [];

      const updateItems = () => {
        const merged = [...approvedItems, ...personalItems];
        // Deduplicate and sort
        const unique = merged.filter((item, index, self) => 
          index === self.findIndex((t) => t.id === item.id)
        ).sort((a, b) => {
           return toMillis(b.createdAt) - toMillis(a.createdAt);
        });
        setItems(unique);
      };

      unsubscribeApproved = onSnapshot(qApproved, (snapshot) => {
        approvedItems.length = 0;
        snapshot.docs.forEach(doc => {
          const item = { id: doc.id, ...doc.data() } as InventoryItem;
          if (!(item as any).deletedAt) approvedItems.push(item);
        });
        updateItems();
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'inventory'));

      unsubscribePersonal = onSnapshot(qPersonal, (snapshot) => {
        personalItems.length = 0;
        snapshot.docs.forEach(doc => {
          const item = { id: doc.id, ...doc.data() } as InventoryItem;
          if (!(item as any).deletedAt) personalItems.push(item);
        });
        updateItems();
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'inventory'));

      return () => {
        unsubscribeApproved();
        unsubscribePersonal();
      };
    }
  }, [isAdmin, requiresTenantContext, shouldScopeByClient, tenantClientId, user.uid]);

  useEffect(() => {
    if (showForm) {
      setLoading(false);
    }
  }, [showForm]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setBrokers([]);
      return;
    }

    const q = query(collection(db, 'brokers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBrokers(snapshot.docs.map((brokerDoc) => ({ id: brokerDoc.id, ...brokerDoc.data() } as Broker)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'brokers'));

    return () => unsubscribe();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isAdmin || items.length === 0) return;
    const missingVisibility = items.filter((item) => !item.visibilityScope);
    if (missingVisibility.length === 0) return;

    const migrateVisibilityScope = async () => {
      for (const item of missingVisibility) {
        try {
          await updateDoc(doc(db, 'inventory', item.id), {
            visibilityScope: 'internal',
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `inventory/${item.id}`);
        }
      }
    };

    void migrateVisibilityScope();
  }, [isAdmin, items]);

  const handleAreaChange = (val: string) => {
    setFormData(prev => ({ ...prev, areaValue: val }));
  };

  const updateProjectUnit = (unitId: string, patch: Partial<ProjectUnitDraft>) => {
    setFormData((prev) => ({
      ...prev,
      projectUnits: prev.projectUnits.map((unit) =>
        unit.id === unitId ? { ...unit, ...patch } : unit
      ),
    }));
  };

  const addProjectUnit = () => {
    setFormData((prev) => ({
      ...prev,
      projectUnits: [...prev.projectUnits, createProjectUnitDraft()],
    }));
  };

  const removeProjectUnit = (unitId: string) => {
    setFormData((prev) => {
      if (prev.projectUnits.length <= 1) return prev;
      return {
        ...prev,
        projectUnits: prev.projectUnits.filter((unit) => unit.id !== unitId),
      };
    });
  };

  const addVideoLink = () => {
    const normalizedLink = normalizeVideoLink(videoLinkInput);
    if (!normalizedLink) return;

    try {
      new URL(normalizedLink);
    } catch {
      alert('Please enter a valid video URL.');
      return;
    }

    const existingLinks = new Set([
      ...videoLinks,
      ...(editingItem?.videos || []),
    ]);
    if (existingLinks.has(normalizedLink)) {
      alert('This video link is already added.');
      return;
    }

    setVideoLinks((prev) => [...prev, normalizedLink]);
    setVideoLinkInput('');
  };

  const handleFileUpload = async (file: File, path: string, timeoutMs: number = 12000) => {
    if (!hasCloudinaryConfig) {
      throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/auto/upload`;
    const body = new FormData();
    body.append('file', file);
    body.append('upload_preset', cloudinaryUploadPreset);
    body.append('folder', `inventory/${path}`);

    let response: Response;
    try {
      response = await withTimeout(
        fetch(endpoint, {
          method: 'POST',
          body,
        }),
        timeoutMs,
        `Upload timed out for ${file.name}.`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Network request failed';
      throw new Error(
        `Could not reach Cloudinary for ${file.name}: ${reason}. Check internet connectivity, Cloudinary CORS, and that the upload preset allows unsigned browser uploads.`
      );
    }

    let result: { secure_url?: string; error?: { message?: string } };
    try {
      result = await withTimeout(
        response.json() as Promise<{ secure_url?: string; error?: { message?: string } }>,
        Math.min(timeoutMs, 8000),
        `Could not parse upload response for ${file.name}.`
      );
    } catch {
      throw new Error(`Cloudinary returned an unreadable upload response for ${file.name}.`);
    }

    if (!response.ok || !result.secure_url) {
      const reason = result?.error?.message || 'Unknown upload error';
      throw new Error(`Cloudinary upload failed for ${file.name}: ${reason}`);
    }

    return result.secure_url;
  };

  const handleSubmit = async (e: FormEvent, isDraftSubmission: boolean = false) => {
    if (e) e.preventDefault();
    let effectiveTenantClientId = tenantClientId;
    let effectiveClientName = String((user as any).clientName || '');

    if (requiresTenantContext && auth.currentUser) {
      try {
        const latestUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (latestUserDoc.exists()) {
          const latestData = latestUserDoc.data() as any;
          const latestClientId = String(latestData?.clientId || '');
          const latestClientName = String(latestData?.clientName || '');
          if (latestClientId) {
            effectiveTenantClientId = latestClientId;
            setTenantClientId(latestClientId);
          }
          if (latestClientName) {
            effectiveClientName = latestClientName;
          }
        }
      } catch {
        // fallback to current session values
      }
    }

    if (requiresTenantContext && !effectiveTenantClientId) {
      setFormNotice({ type: 'error', message: 'Your account is missing company mapping. Please contact super admin.' });
      return;
    }
    const isProjectListing = formData.listingMode === 'project';

    if (!formData.title || !formData.location) {
      setFormNotice({ type: 'error', message: 'Please fill all mandatory fields.' });
      return;
    }

    if (!isProjectListing && (!formData.areaValue || !formData.rate)) {
      setFormNotice({ type: 'error', message: 'Please fill all mandatory fields.' });
      return;
    }

    if (isProjectListing) {
      if (formData.projectUnits.length === 0) {
        setFormNotice({ type: 'error', message: 'Please add at least one project unit.' });
        return;
      }
      for (let i = 0; i < formData.projectUnits.length; i += 1) {
        const unit = formData.projectUnits[i];
        if (!unit.title || !unit.areaValue || !unit.rate) {
          setFormNotice({ type: 'error', message: `Please complete title, area and rate for unit ${i + 1}.` });
          return;
        }
      }
    }

    const hasProjectUnitUploads = formData.projectUnits.some((unit) => unit.newPhotos.length > 0);
    const hasSinglePhotoUploads = !isProjectListing && files.photos.length > 0;
    const hasVideoUploads = files.videos.length > 0;

    setFormNotice(null);
    setLoading(true);
    try {
      const uploadWarnings: string[] = [];
      if ((hasSinglePhotoUploads || files.attachments.length > 0 || hasProjectUnitUploads || hasVideoUploads) && !hasCloudinaryConfig) {
        uploadWarnings.push('Cloudinary is not configured, so selected files were not uploaded');
      }
      const videoUrls = editingItem ? [...(editingItem.videos || [])] : [];
      videoLinks.forEach((link) => {
        if (!videoUrls.includes(link)) {
          videoUrls.push(link);
        }
      });
      for (const file of files.videos) {
        try {
          const url = await handleFileUpload(file, 'videos');
          videoUrls.push(url);
        } catch (uploadError) {
          console.error('Video upload failed:', uploadError);
          uploadWarnings.push(`Video upload failed: ${file.name}`);
        }
      }

      const attachmentData = editingItem ? [...editingItem.attachments] : [];
      for (const file of files.attachments) {
        try {
          const url = await handleFileUpload(file, 'attachments');
          attachmentData.push({ name: file.name, url });
        } catch (uploadError) {
          console.error('Attachment upload failed:', uploadError);
          uploadWarnings.push(`Document upload failed: ${file.name}`);
        }
      }

      const selectedListingStatus: InventoryStatus =
        formData.approvalStatus === 'approved' ? 'approved' : 'pending_approval';

      const payload: Partial<InventoryItem> = {
        title: formData.title,
        description: formData.description,
        visibilityScope: formData.visibilityScope,
        listingMode: isProjectListing ? 'project' : 'single',
        isProject: isProjectListing,
        location: formData.location,
        nearbyLocation: formData.nearbyLocation,
        landmark: formData.landmark,
        locationLink: normalizeLocationLink(formData.locationLink),
        latitude: formData.latitude,
        longitude: formData.longitude,
        videos: videoUrls,
        attachments: attachmentData,
        updatedAt: serverTimestamp(),
      };

      if (isSuperAdmin) {
        const selectedBroker = brokers.find((broker) => broker.id === formData.brokerId);
        payload.brokerId = selectedBroker?.id || '';
        payload.brokerName = selectedBroker?.name || '';
        payload.brokerPhone = selectedBroker?.phone || '';
      }

      if (isProjectListing) {
        const projectUnitsPayload: ProjectUnit[] = [];
        for (let i = 0; i < formData.projectUnits.length; i += 1) {
          const unit = formData.projectUnits[i];
          const unitPhotoUrls = [...unit.photos];
          for (const file of unit.newPhotos) {
            try {
              const url = await handleFileUpload(file, `project-units/unit-${i + 1}`);
              unitPhotoUrls.push(url);
            } catch (uploadError) {
              console.error('Project unit photo upload failed:', uploadError);
              uploadWarnings.push(`Unit ${i + 1} photo upload failed: ${file.name}`);
            }
          }

          const convertedUnit = convertArea(Number(unit.areaValue), unit.areaUnit as AreaUnit);
          const unitPayload: ProjectUnit = {
            id: unit.id,
            title: unit.title,
            type: unit.type,
            subType: unit.subType,
            areaValue: Number(unit.areaValue),
            areaUnit: unit.areaUnit,
            areaAcre: convertedUnit.acre,
            areaSqft: convertedUnit.sqft,
            areaSqYard: convertedUnit.sqyard,
            areaSqMtr: convertedUnit.sqmtr,
            areaHectare: convertedUnit.hectare,
            rate: Number(unit.rate),
            rateUnit: unit.rateUnit || 'total',
            photos: unitPhotoUrls,
          };

          if (unit.type === 'house') {
            unitPayload.houseType = unit.houseType;
            unitPayload.bhk = Number(unit.bhk);
            unitPayload.bathrooms = Number(unit.bathrooms);
            unitPayload.kitchenType = unit.kitchenType;
          }

          projectUnitsPayload.push(unitPayload);
        }

        const firstUnit = projectUnitsPayload[0];
        payload.projectUnits = projectUnitsPayload;
        payload.projectUnitCount = projectUnitsPayload.length;
        payload.type = firstUnit.type;
        payload.subType = firstUnit.subType;
        payload.areaValue = firstUnit.areaValue;
        payload.areaUnit = firstUnit.areaUnit;
        payload.areaAcre = firstUnit.areaAcre;
        payload.areaSqft = firstUnit.areaSqft;
        payload.areaSqYard = firstUnit.areaSqYard;
        payload.areaSqMtr = firstUnit.areaSqMtr;
        payload.areaHectare = firstUnit.areaHectare;
        payload.rate = firstUnit.rate;
        payload.rateUnit = firstUnit.rateUnit;
        payload.photos = projectUnitsPayload.flatMap((unit) => unit.photos.slice(0, 1));
      } else {
        const converted = convertArea(Number(formData.areaValue), formData.areaUnit);
        const photoUrls = editingItem ? [...editingItem.photos] : [];
        for (const file of files.photos) {
          try {
            const url = await handleFileUpload(file, 'photos');
            photoUrls.push(url);
          } catch (uploadError) {
            console.error('Photo upload failed:', uploadError);
            uploadWarnings.push(`Photo upload failed: ${file.name}`);
          }
        }

        payload.type = formData.type;
        payload.subType = formData.subType;
        payload.areaValue = Number(formData.areaValue);
        payload.areaUnit = formData.areaUnit;
        payload.areaAcre = converted.acre;
        payload.areaSqft = converted.sqft;
        payload.areaSqYard = converted.sqyard;
        payload.areaSqMtr = converted.sqmtr;
        payload.areaHectare = converted.hectare;
        payload.rate = Number(formData.rate);
        payload.rateUnit = formData.rateUnit;
        payload.photos = photoUrls;
        payload.projectUnits = [];
        payload.projectUnitCount = 0;

        if (formData.type === 'house') {
          payload.houseType = formData.houseType;
          payload.bhk = Number(formData.bhk);
          payload.bathrooms = Number(formData.bathrooms);
          payload.kitchenType = formData.kitchenType;
          payload.features = formData.features;
        }
      }

      if (editingItem) {
        const updatePayload = {
          ...payload,
          status: isDraftSubmission ? 'draft' : selectedListingStatus
        };
        await updateDoc(doc(db, 'inventory', editingItem.id), updatePayload);
        await writeInventoryBackup(editingItem.id, 'inventory_updated', {
          ...editingItem,
          ...updatePayload,
          id: editingItem.id,
        });
        await addAuditLog(db, {
          action: 'inventory_modified',
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          targetType: 'inventory',
          targetId: editingItem.id,
          clientId: user.clientId,
          description: `Inventory updated: ${payload.title}`,
          oldValue: editingItem,
          newValue: updatePayload,
        });
      } else {
        const createDoc = async (status: InventoryStatus) => {
          const documentPayload = {
            ...payload,
            status,
            submitterId: auth.currentUser?.uid || user.uid,
            submitterName: user.name,
            clientId: effectiveTenantClientId,
            clientName: effectiveClientName,
            ...(status === 'approved'
              ? {
                  approvedBy: user.name,
                  approvalAt: serverTimestamp(),
                }
              : {}),
          };

          const inventoryRef = await addDoc(collection(db, 'inventory'), {
            ...documentPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await writeInventoryBackup(inventoryRef.id, 'inventory_created', documentPayload);
          return inventoryRef;
        };

        const shouldAutoApproveAdminCreate =
          isAdmin && !isDraftSubmission && !editingItem;
        const intendedStatus: InventoryStatus = isDraftSubmission
          ? 'draft'
          : shouldAutoApproveAdminCreate
            ? 'approved'
            : selectedListingStatus;
        const inventoryRef = await createDoc(intendedStatus);
        if (shouldAutoApproveAdminCreate) {
          await writeInventoryBackup(inventoryRef.id, 'inventory_auto_approved', {
            ...payload,
            status: 'approved',
            approvedBy: user.name,
            submitterId: auth.currentUser?.uid || user.uid,
            submitterName: user.name,
            clientId: effectiveTenantClientId,
            clientName: effectiveClientName,
          });
        }
        await addAuditLog(db, {
          action: 'inventory_added',
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          targetType: 'inventory',
          targetId: inventoryRef.id,
          clientId: user.clientId,
          description: shouldAutoApproveAdminCreate
            ? `Inventory added and auto-approved: ${payload.title}`
            : `Inventory added: ${payload.title}`,
          newValue: shouldAutoApproveAdminCreate
            ? { ...payload, status: 'approved', approvedBy: user.name }
            : payload,
        });
      }

      setShowForm(false);
      setEditingItem(null);
      setFormData({
        title: '',
        description: '',
        brokerId: '',
        visibilityScope: 'internal',
        listingMode: 'single',
        type: 'house',
        areaValue: '',
        areaUnit: 'sqft',
        subType: 'new',
        approvalStatus: 'non_approved',
        rate: '',
        rateUnit: 'total',
        location: '',
        nearbyLocation: '',
        landmark: '',
        locationLink: '',
        houseType: 'simplex',
        bhk: '',
        bathrooms: '',
        kitchenType: '',
        features: [],
        newFeature: '',
        projectUnits: [createProjectUnitDraft()],
        latitude: 20.5937,
        longitude: 78.9629
      });
      setFiles({ photos: [], videos: [], attachments: [] });
      setVideoLinks([]);
      setVideoLinkInput('');
      
      const effectiveStatus: InventoryStatus = isDraftSubmission
        ? 'draft'
        : (isAdmin && !editingItem)
          ? 'approved'
          : formData.approvalStatus === 'approved'
          ? 'approved'
          : 'pending_approval';
      const successMessage = isDraftSubmission
        ? 'Listing saved as draft!'
        : effectiveStatus === 'approved'
          ? (editingItem ? 'Listing updated as approved!' : 'Listing saved as approved!')
          : (editingItem ? 'Listing updated as non-approved!' : 'Listing saved as non-approved!');
      if (uploadWarnings.length > 0) {
        setFormNotice({
          type: 'success',
          message: `${successMessage} Some files could not be uploaded: ${uploadWarnings.join(' | ')}`,
        });
      } else {
        setFormNotice({ type: 'success', message: successMessage });
      }
    } catch (error) {
      if (String((error as any)?.code || '').includes('permission-denied') && auth.currentUser) {
        try {
          const latestUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          const latest = latestUserDoc.exists() ? (latestUserDoc.data() as any) : null;
          console.error('Inventory create permission diagnostics', {
            authUid: auth.currentUser.uid,
            authEmail: auth.currentUser.email,
            latestUserRole: latest?.role || null,
            latestUserClientId: latest?.clientId || null,
            formClientId: tenantClientId || null,
          });
        } catch {
          // noop
        }
      }
      const message = handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, 'inventory');
      setFormNotice({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string, status: InventoryStatus) => {
    try {
      await updateDoc(doc(db, 'inventory', id), {
        status,
        approvedBy: user.name,
        approvalAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      const existing = items.find((item) => item.id === id);
      await writeInventoryBackup(id, `inventory_${status}`, {
        ...(existing || {}),
        id,
        status,
        approvedBy: user.name,
      });
      await addAuditLog(db, {
        action: status === 'approved' ? 'inventory_approved' : 'inventory_status_changed',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'inventory',
        targetId: id,
        clientId: user.clientId,
        description: `Inventory status updated to ${status}`,
        newValue: { status, approvedBy: user.name },
      });
      setFormNotice({ type: 'success', message: status === 'approved' ? 'Listing approved successfully.' : 'Listing rejected successfully.' });
    } catch (error) {
      const message = handleFirestoreError(error, OperationType.UPDATE, `inventory/${id}`);
      setFormNotice({ type: 'error', message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return;
    try {
      const existing = items.find((item) => item.id === id);
      await updateDoc(doc(db, 'inventory', id), {
        deletedAt: serverTimestamp(),
        deletedBy: user.uid,
        deletedByName: user.name,
        updatedAt: serverTimestamp(),
      });
      await writeInventoryBackup(id, 'inventory_archived', {
        ...(existing || {}),
        id,
        deletedBy: user.uid,
        deletedByName: user.name,
      });
      await addAuditLog(db, {
        action: 'inventory_archived',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'inventory',
        targetId: id,
        clientId: user.clientId,
        description: `Inventory archived${existing?.title ? ` (${existing.title})` : ''}`,
        oldValue: existing || null,
        newValue: { deletedAt: 'serverTimestamp', deletedBy: user.uid },
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${id}`);
    }
  };

  const startEdit = (item: InventoryItem) => {
    const area = getAreaDisplay(item);
    const inferredListingMode: ListingMode =
      item.listingMode === 'project' || item.isProject || (item.projectUnits?.length || 0) > 0
        ? 'project'
        : 'single';
    const mappedProjectUnits: ProjectUnitDraft[] = (item.projectUnits || []).map((unit) => ({
      id: unit.id,
      title: unit.title,
      type: unit.type,
      subType: unit.subType || (unit.type === 'house' ? 'new' : 'commercial'),
      areaValue: typeof unit.areaValue === 'number' ? unit.areaValue : '',
      areaUnit: unit.areaUnit || 'sqft',
      areaAcre: unit.areaAcre || 0,
      areaSqft: unit.areaSqft || 0,
      areaSqYard: unit.areaSqYard || 0,
      areaSqMtr: unit.areaSqMtr || 0,
      areaHectare: unit.areaHectare || 0,
      rate: unit.rate || '',
      rateUnit: unit.rateUnit || 'total',
      houseType: unit.houseType || 'simplex',
      bhk: unit.bhk || '',
      bathrooms: unit.bathrooms || '',
      kitchenType: unit.kitchenType || '',
      photos: unit.photos || [],
      newPhotos: [],
    }));

    setEditingItem(item);
    setFormData({
      title: item.title,
      description: item.description || '',
      brokerId: item.brokerId || '',
      visibilityScope: item.visibilityScope || 'internal',
      listingMode: inferredListingMode,
      type: item.type,
      areaValue: area?.value ?? '',
      areaUnit: area?.unit ?? 'sqft',
      subType: item.subType || (item.type === 'house' ? 'new' : item.type === 'zameen' ? 'agricultural' : 'commercial'),
      approvalStatus: item.status === 'approved' ? 'approved' : 'non_approved',
      rate: item.rate,
      rateUnit: item.rateUnit,
      location: item.location,
      nearbyLocation: item.nearbyLocation || '',
      landmark: item.landmark || '',
      locationLink: item.locationLink || '',
      houseType: item.houseType || 'simplex',
      bhk: item.bhk || '',
      bathrooms: item.bathrooms || '',
      kitchenType: item.kitchenType || '',
      features: item.features || [],
      newFeature: '',
      projectUnits: mappedProjectUnits.length > 0 ? mappedProjectUnits : [createProjectUnitDraft()],
      latitude: (item as any).latitude || 20.5937,
      longitude: (item as any).longitude || 78.9629
    });
    setVideoLinks([]);
    setVideoLinkInput('');
    setShowForm(true);
  };

  const filteredItems = items.filter(item => {
    if ((item as any).deletedAt) return false;
    const isPersonalItem = item.submitterId === user.uid;
    const isVisibleNonApproved = isAdmin || isPersonalItem;
    const matchesFilter = (() => {
      if (filter === 'all') return item.status !== 'draft' || isPersonalItem;
      if (filter === 'approved') return item.status === 'approved';
      if (filter === 'non_approved') return item.status !== 'approved' && isVisibleNonApproved;
      if (filter === 'pending') return item.status === 'pending_approval';
      return item.status === 'draft';
    })();
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.location.toLowerCase().includes(searchQuery.toLowerCase());

    const stateQuery = advancedFilters.state.trim().toLowerCase();
    const cityQuery = advancedFilters.city.trim().toLowerCase();
    const areaQuery = advancedFilters.area.trim().toLowerCase();
    const locationText = `${item.location || ''} ${item.nearbyLocation || ''} ${item.landmark || ''}`.toLowerCase();
    const matchesState = !stateQuery || locationText.includes(stateQuery);
    const matchesCity = !cityQuery || locationText.includes(cityQuery);
    const matchesArea = !areaQuery || locationText.includes(areaQuery);

    const sizeComparable = (() => {
      if (typeof item.areaSqft === 'number' && item.areaSqft > 0) return item.areaSqft;
      if (typeof item.areaValue === 'number' && item.areaUnit && AREA_CONVERSIONS[item.areaUnit]) {
        return convertArea(item.areaValue, item.areaUnit).sqft;
      }
      if (typeof item.areaSqYard === 'number' && item.areaSqYard > 0) return item.areaSqYard * (AREA_CONVERSIONS.sqft / AREA_CONVERSIONS.sqyard);
      if (typeof item.areaSqMtr === 'number' && item.areaSqMtr > 0) return item.areaSqMtr * (AREA_CONVERSIONS.sqft / AREA_CONVERSIONS.sqmtr);
      if (typeof item.areaAcre === 'number' && item.areaAcre > 0) return item.areaAcre * AREA_CONVERSIONS.sqft;
      if (typeof item.areaHectare === 'number' && item.areaHectare > 0) return item.areaHectare * (AREA_CONVERSIONS.sqft / AREA_CONVERSIONS.hectare);
      return 0;
    })();

    const minSize = Number(advancedFilters.minSize) || 0;
    const maxSize = Number(advancedFilters.maxSize) || 0;
    const matchesMinSize = !advancedFilters.minSize || sizeComparable >= minSize;
    const matchesMaxSize = !advancedFilters.maxSize || sizeComparable <= maxSize;

    const budgetComparable = sizeComparable * Number(item.rate || 0);
    const minBudget = Number(advancedFilters.minBudget) || 0;
    const maxBudget = Number(advancedFilters.maxBudget) || 0;
    const matchesMinBudget = !advancedFilters.minBudget || budgetComparable >= minBudget;
    const matchesMaxBudget = !advancedFilters.maxBudget || budgetComparable <= maxBudget;

    return matchesFilter && matchesSearch && matchesState && matchesCity && matchesArea && matchesMinSize && matchesMaxSize && matchesMinBudget && matchesMaxBudget;
  });

  const areaUnits = Object.keys(AREA_CONVERSIONS) as Array<AreaUnit>;
  const areaUnitLabels: Record<AreaUnit, string> = {
    acre: 'Acre',
    sqft: 'Sqft',
    sqyard: 'Sqyard',
    sqmtr: 'Sqmtr',
    hectare: 'Hectare',
  };

  const inventoryTypeLabels: Record<InventoryType, string> = {
    zameen: 'Zameen',
    house: 'House/Villa',
    others: 'Others',
    plot: 'Plot',
  };

  const subTypeOptionsByType: Record<InventoryType, Array<{ value: string; label: string }>> = {
    house: [
      { value: 'new', label: 'New' },
      { value: 'resell', label: 'Resell' }
    ],
    zameen: [
      { value: 'agricultural', label: 'Agricultural' },
      { value: 'non_agricultural', label: 'Non Agricultural' }
    ],
    others: [
      { value: 'warehouse', label: 'Warehouse' },
      { value: 'hotel_resort', label: 'Hotel & Resort' },
      { value: 'commercial', label: 'Commercial' },
      { value: 'mixed_use', label: 'Mix Use' },
      { value: 'industrial', label: 'Industrial' }
    ],
    plot: [
      { value: 'warehouse', label: 'Warehouse' },
      { value: 'hotel_resort', label: 'Hotel & Resort' },
      { value: 'commercial', label: 'Commercial' },
      { value: 'mixed_use', label: 'Mix Use' },
      { value: 'industrial', label: 'Industrial' }
    ]
  };

  const getSubTypeLabel = (itemType: InventoryType, subType?: string): string => {
    if (!subType) return '';
    return subTypeOptionsByType[itemType]?.find(opt => opt.value === subType)?.label || subType;
  };

  const getAreaDisplay = (item: InventoryItem): { value: number; unit: AreaUnit } | null => {
    if (typeof item.areaValue === 'number' && item.areaUnit) {
      return { value: item.areaValue, unit: item.areaUnit };
    }

    if (typeof item.areaSqft === 'number' && item.areaSqft > 0) return { value: item.areaSqft, unit: 'sqft' };
    if (typeof item.areaSqYard === 'number' && item.areaSqYard > 0) return { value: item.areaSqYard, unit: 'sqyard' };
    if (typeof item.areaSqMtr === 'number' && item.areaSqMtr > 0) return { value: item.areaSqMtr, unit: 'sqmtr' };
    if (typeof item.areaAcre === 'number' && item.areaAcre > 0) return { value: item.areaAcre, unit: 'acre' };
    if (typeof item.areaHectare === 'number' && item.areaHectare > 0) return { value: item.areaHectare, unit: 'hectare' };

    return null;
  };

  const getPrimarySizeText = (item: InventoryItem): string => {
    const area = getAreaDisplay(item);
    if (area) return `${Number(area.value).toLocaleString()} ${area.unit}`;
    return 'N/A';
  };

  const getTypeWithSubType = (item: InventoryItem): string => {
    const baseType = inventoryTypeLabels[item.type];
    const subType = getSubTypeLabel(item.type, item.subType);
    return subType ? `${baseType} ${subType}` : baseType;
  };

  const shareOnWhatsApp = (item: InventoryItem) => {
    setSelectedShareItem(item);
    setShareModalOpen(true);
  }; 

  return (
    <div className="space-y-8 pb-24 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <LayoutGrid size={24} />
             </div>
             <div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  Inventory
                </h2>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                  {isAdmin ? 'Property Portfolio' : 'My Listings'}
                </p>
             </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onBack && (
             <button 
                onClick={onBack}
                className="px-5 py-3 bg-white border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all active:scale-95"
              >
                Back
              </button>
          )}
          <button 
            onClick={() => {
              setEditingItem(null);
              setFormData({
                title: '',
                description: '',
                brokerId: '',
                visibilityScope: 'internal',
                listingMode: 'single',
                type: 'house',
                areaValue: '',
                areaUnit: 'sqft',
                subType: 'new',
                approvalStatus: 'non_approved',
                rate: '',
                rateUnit: 'total',
                location: '',
                nearbyLocation: '',
                landmark: '',
                locationLink: '',
                houseType: 'simplex',
                bhk: '',
                bathrooms: '',
                kitchenType: '',
                features: [],
                newFeature: '',
                projectUnits: [createProjectUnitDraft()],
                latitude: 20.5937,
                longitude: 78.9629
              });
              setFiles({ photos: [], videos: [], attachments: [] });
              setVideoLinks([]);
              setVideoLinkInput('');
              setShowForm(true);
            }}
            className="px-6 py-3 bg-slate-900 text-white font-bold text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={18} /> New Listing
          </button>
        </div>
      </div>

      {/* Filters & Search - Refined */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center bg-white/50 p-2 rounded-[32px] border border-slate-100">
        <div className="flex-1 relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
          <input 
            type="text"
            placeholder="Search listings..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-14 pr-6 py-4 bg-white rounded-3xl outline-none border border-transparent focus:border-blue-100 focus:bg-white font-semibold text-slate-700 transition-all shadow-sm"
          />
        </div>
        <div className="space-y-1">
          <p className="px-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">Property Status</p>
          <div className="flex bg-slate-200/50 p-1 rounded-2xl gap-1 overflow-x-auto no-scrollbar whitespace-nowrap">
          {[
            { id: 'all', label: 'All', icon: LayoutGrid },
            { id: 'approved', label: 'Approved', icon: FileCheck },
            { id: 'non_approved', label: 'Non-Approved', icon: FileText },
            { id: 'pending', label: 'Awaiting', icon: Clock },
            { id: 'draft', label: 'Drafts', icon: Edit2 }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id as any)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                filter === t.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="bg-white/60 p-3 sm:p-4 rounded-[28px] border border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <input
            type="text"
            value={advancedFilters.state}
            onChange={e => setAdvancedFilters(prev => ({ ...prev, state: e.target.value }))}
            placeholder="State"
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 text-sm font-medium text-slate-700"
          />
          <input
            type="text"
            value={advancedFilters.city}
            onChange={e => setAdvancedFilters(prev => ({ ...prev, city: e.target.value }))}
            placeholder="City"
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 text-sm font-medium text-slate-700"
          />
          <input
            type="text"
            value={advancedFilters.area}
            onChange={e => setAdvancedFilters(prev => ({ ...prev, area: e.target.value }))}
            placeholder="Area / Locality"
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 text-sm font-medium text-slate-700"
          />
          <input
            type="number"
            min="0"
            value={advancedFilters.minBudget}
            onChange={e => setAdvancedFilters(prev => ({ ...prev, minBudget: e.target.value }))}
            placeholder="Min Budget"
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 text-sm font-medium text-slate-700"
          />
          <input
            type="number"
            min="0"
            value={advancedFilters.maxBudget}
            onChange={e => setAdvancedFilters(prev => ({ ...prev, maxBudget: e.target.value }))}
            placeholder="Max Budget"
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 text-sm font-medium text-slate-700"
          />
          <input
            type="number"
            min="0"
            value={advancedFilters.minSize}
            onChange={e => setAdvancedFilters(prev => ({ ...prev, minSize: e.target.value }))}
            placeholder="Min Size (sqft)"
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 text-sm font-medium text-slate-700"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={advancedFilters.maxSize}
              onChange={e => setAdvancedFilters(prev => ({ ...prev, maxSize: e.target.value }))}
              placeholder="Max Size (sqft)"
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 text-sm font-medium text-slate-700"
            />
            <button
              type="button"
              onClick={() => setAdvancedFilters({ state: '', city: '', area: '', minBudget: '', maxBudget: '', minSize: '', maxSize: '' })}
              className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Grid - Improved spacing and density */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 px-1">
        <AnimatePresence mode="popLayout">
          {filteredItems.map(item => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => startEdit(item)}
              className="group bg-white rounded-[32px] border border-slate-100 overflow-hidden hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 flex flex-col h-full cursor-pointer"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-slate-50">
                {item.photos?.[0] ? (
                  <img src={item.photos[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <ImageIcon size={48} strokeWidth={1} />
                  </div>
                )}
                
                {/* Status Badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                   <div className={cn(
                    "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] backdrop-blur-md shadow-lg",
                    item.status === 'approved' ? "bg-emerald-500/90 text-white" : 
                    item.status === 'pending_approval' ? "bg-amber-500/90 text-white" : 
                    item.status === 'draft' ? "bg-slate-500/90 text-white" :
                    "bg-rose-500/90 text-white"
                  )}>
                    {item.status.replace('_', ' ')}
                  </div>
                  <div className="px-4 py-1.5 bg-black/60 backdrop-blur-md text-white rounded-full text-[9px] font-black uppercase tracking-[0.2em]">
                    {getTypeWithSubType(item)}
                  </div>
                  {!!item.videos?.length && (
                    <div className="px-4 py-1.5 bg-indigo-600/80 backdrop-blur-md text-white rounded-full text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5">
                      <Film size={10} />
                      {item.videos.length} Video{item.videos.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {isAdmin && item.status === 'pending_approval' && (
                  <div className="hidden sm:flex absolute inset-0 bg-slate-900/35 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center">
                    <span className="px-4 py-2 rounded-full bg-white text-slate-800 text-[10px] font-black uppercase tracking-widest shadow-xl">
                      Open to Review & Approve
                    </span>
                  </div>
                )}
              </div>

              <div className="p-6 space-y-6 flex-1 flex flex-col">
                <div className="space-y-2">
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                    <MapPin size={14} className="text-blue-500" />
                    {item.location}
                  </div>
                  {item.subType && (
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {getTypeWithSubType(item)}
                    </p>
                  )}
                  {item.description && (
                    <p className="text-xs font-medium text-slate-500 leading-relaxed line-clamp-3">
                      {item.description}
                    </p>
                  )}
                  {isSuperAdmin && item.brokerName && (
                    <p className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl inline-flex w-fit uppercase tracking-widest">
                      Broker: {item.brokerName}
                    </p>
                  )}
                </div>

                {!!item.videos?.[0] && (
                  <div
                    className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {isDirectVideoUrl(item.videos[0]) ? (
                      <video
                        src={item.videos[0]}
                        controls
                        preload="metadata"
                        className="w-full h-40 object-cover bg-black"
                      />
                    ) : (
                      <a
                        href={item.videos[0]}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="flex h-40 flex-col items-center justify-center gap-3 text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <ExternalLink size={24} />
                        <span className="text-xs font-black uppercase tracking-widest">Open Video Link</span>
                        <span className="max-w-[80%] truncate text-[10px] font-bold text-slate-400">{getVideoLinkLabel(item.videos[0])}</span>
                      </a>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 leading-none">Area</p>
                    <p className="text-slate-900 font-mono font-bold text-lg leading-none">
                      {(() => {
                        const area = getAreaDisplay(item);
                        if (!area) return 'N/A';
                        return (
                          <>
                            {Number(area.value).toLocaleString()} <span className="text-[10px] text-slate-400 font-sans tracking-normal ml-0.5">{area.unit}</span>
                          </>
                        );
                      })()}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-2xl">
                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1.5 leading-none">Rate</p>
                    <p className="text-blue-600 font-mono font-bold text-lg leading-none">
                      <span className="text-sm mr-0.5">₹</span>{Number(item.rate).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 mt-auto border-t border-slate-50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shadow-inner">
                      {item.submitterName.charAt(0)}
                    </div>
                    <div className="max-w-[100px]">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] leading-none mb-1">Listed by</p>
                      <p className="text-xs font-bold text-slate-700 leading-none truncate">{item.submitterName}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        shareOnWhatsApp(item);
                      }}
                      className="w-10 h-10 flex items-center justify-center text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all"
                      title="Share on WhatsApp"
                      aria-label="Share on WhatsApp"
                    >
                      <Share2 size={18} />
                    </button>
                    <a
                      href={getInventoryLocationLink(item)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="w-10 h-10 flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all"
                      title="Open location in Google Maps"
                      aria-label="Open location in Google Maps"
                    >
                      <MapPin size={18} />
                    </a>
                    <button 
                      onClick={(event) => {
                        event.stopPropagation();
                        startEdit(item);
                      }}
                      className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    >
                      <Edit2 size={18} />
                    </button>
                    {(isAdmin || (item.submitterId === user.uid && item.status === 'draft')) && (
                      <button 
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <div className="col-span-full py-40 bg-white/50 rounded-[64px] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-6">
              <Search size={48} />
            </div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">No property found</h3>
            <p className="text-slate-400 font-bold mt-2">Try adjusting your filters or search terms</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-0 sm:p-4 lg:p-10">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full h-full sm:h-auto sm:max-h-[90vh] max-w-5xl bg-white sm:rounded-[48px] overflow-hidden shadow-2xl flex flex-col"
            >
              <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-200">
                      <Plus size={22} className="sm:hidden" />
                      <Plus size={26} className="hidden sm:block" />
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                        {editingItem ? 'Edit Property' : 'Add New Property'}
                      </h3>
                      <p className="text-slate-400 font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em] mt-0.5">Property details & media</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => {
                        setShowForm(false);
                        setEditingItem(null);
                    }} 
                    className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center shadow-lg shadow-slate-200/50"
                  >
                    <X size={18} className="sm:hidden" />
                    <X size={22} className="hidden sm:block" />
                  </button>
                </div>
                {formNotice && (
                  <div className={`mx-4 sm:mx-5 mt-3 px-4 py-3 rounded-2xl text-sm font-bold ${formNotice.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                    {formNotice.message}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 bg-white">
                  <div className="max-w-5xl mx-auto p-6 sm:p-10 lg:p-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12">
                      {/* Left Column: Core Info */}
                      <div className="space-y-10">
                        <section className="space-y-6">
                          <header className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                              <FileText size={20} />
                            </div>
                            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Basic info</h3>
                          </header>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <RequiredLabel className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Listing Title</RequiredLabel>
                              <input 
                                required
                                value={formData.title}
                                onChange={e => setFormData({...formData, title: e.target.value})}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none font-bold text-slate-700 transition-all"
                                placeholder="Prime Property Title"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Description</label>
                              <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full h-28 px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none font-medium text-slate-700 transition-all resize-none"
                                placeholder="Property notes, owner terms, access details..."
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Listing Mode</label>
                              <select
                                value={formData.listingMode}
                                onChange={e => {
                                  const nextMode = e.target.value as ListingMode;
                                  setFormData((prev) => ({
                                    ...prev,
                                    listingMode: nextMode,
                                    projectUnits:
                                      nextMode === 'project' && prev.projectUnits.length === 0
                                        ? [createProjectUnitDraft()]
                                        : prev.projectUnits
                                  }));
                                }}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700 transition-all"
                              >
                                <option value="single">Single Property</option>
                                <option value="project">Project (Multiple Units)</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Visibility</label>
                              <select
                                value={formData.visibilityScope}
                                onChange={e => setFormData({ ...formData, visibilityScope: e.target.value as InventoryVisibility })}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700 transition-all"
                              >
                                <option value="internal">Internal</option>
                                <option value="all">All</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <RequiredLabel className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Property Type</RequiredLabel>
                                <select 
                                  value={formData.type}
                                  onChange={e => {
                                    const nextType = e.target.value as InventoryType;
                                    const defaultSubType = subTypeOptionsByType[nextType]?.[0]?.value || '';
                                    setFormData({ ...formData, type: nextType, subType: defaultSubType });
                                  }}
                                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700 transition-all"
                                >
                                  <option value="house">House/Villa</option>
                                  <option value="zameen">Land</option>
                                  <option value="others">Others</option>
                                  <option value="plot">Plot (Legacy)</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <RequiredLabel className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Category</RequiredLabel>
                                <select
                                  value={formData.subType}
                                  onChange={e => setFormData({ ...formData, subType: e.target.value })}
                                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700 transition-all"
                                >
                                  {(subTypeOptionsByType[formData.type] || []).map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {isSuperAdmin && (
                                <div className="space-y-2 sm:col-span-2">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Assign Broker</label>
                                  <select
                                    value={formData.brokerId}
                                    onChange={e => setFormData({ ...formData, brokerId: e.target.value })}
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700 transition-all"
                                  >
                                    <option value="">No broker assigned</option>
                                    {brokers.map((broker) => (
                                      <option key={broker.id} value={broker.id}>
                                        {broker.name} ({broker.phone})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div className="space-y-2 sm:col-span-2">
                                <RequiredLabel className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Approval Status</RequiredLabel>
                                <select
                                  required
                                  value={formData.approvalStatus}
                                  onChange={e => setFormData({ ...formData, approvalStatus: e.target.value as 'approved' | 'non_approved' })}
                                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700 transition-all"
                                >
                                  <option value="approved">Approved</option>
                                  <option value="non_approved">Non Approved</option>
                                </select>
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <RequiredLabel className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Rate</RequiredLabel>
                                <input 
                                  required={formData.listingMode === 'single'}
                                  type="number"
                                  value={formData.rate}
                                  onChange={e => setFormData({...formData, rate: e.target.value})}
                                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-mono font-bold text-slate-700 transition-all"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
                        </section>

                        <section className="space-y-6">
                           <header className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100">
                              <MapPin size={20} />
                            </div>
                            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Location</h3>
                          </header>

                          <div className="space-y-4">
                            <div className="space-y-2">
                               <RequiredLabel className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Primary Location</RequiredLabel>
                               <input 
                                  required
                                  value={formData.location}
                                  onChange={e => setFormData({...formData, location: e.target.value})}
                                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 transition-all"
                                  placeholder="City / Area"
                               />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <input 
                                value={formData.nearbyLocation}
                                onChange={e => setFormData({...formData, nearbyLocation: e.target.value})}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 transition-all"
                                placeholder="Sub-locality"
                              />
                              <input 
                                value={formData.landmark}
                                onChange={e => setFormData({...formData, landmark: e.target.value})}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 transition-all"
                                placeholder="Landmark"
                              />
                            </div>

                            <div className="space-y-3 pt-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                                Exact Coordinates <span className="text-rose-500">*</span>
                              </label>
                              <div className="grid grid-cols-2 gap-4">
                                <input
                                  type="number"
                                  step="any"
                                  value={formData.latitude}
                                  onChange={(e) => setFormData({ ...formData, latitude: Number(e.target.value) || 0 })}
                                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-mono font-bold text-slate-700 transition-all"
                                  placeholder="Latitude"
                                />
                                <input
                                  type="number"
                                  step="any"
                                  value={formData.longitude}
                                  onChange={(e) => setFormData({ ...formData, longitude: Number(e.target.value) || 0 })}
                                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-mono font-bold text-slate-700 transition-all"
                                  placeholder="Longitude"
                                />
                              </div>
                              <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4 space-y-3">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Google Maps Location Link</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">Open Maps, copy the share link, then paste it here to save with inventory.</p>
                                  </div>
                                  <a
                                    href={buildGoogleMapsLink(formData.latitude, formData.longitude)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                                  >
                                    <ExternalLink size={14} /> Open Google Maps
                                  </a>
                                </div>
                                <div className="relative">
                                  <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                  <input
                                    value={formData.locationLink}
                                    onChange={(e) => {
                                      const nextLink = e.target.value;
                                      const parsed = parseCoordinatesFromMapLink(nextLink);
                                      setFormData({
                                        ...formData,
                                        locationLink: nextLink,
                                        ...(parsed ? { latitude: parsed.latitude, longitude: parsed.longitude } : {}),
                                      });
                                    }}
                                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-medium text-slate-700 transition-all"
                                    placeholder="Paste Google Maps share link"
                                  />
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400 text-center font-bold">
                                Latitude: {formData.latitude.toFixed(6)} | Longitude: {formData.longitude.toFixed(6)}
                              </p>
                            </div>
                          </div>
                          
                          {formData.listingMode === 'single' && formData.type === 'house' && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="bg-blue-50/50 p-6 sm:p-8 rounded-[32px] border border-blue-100 space-y-6 mt-6"
                            >
                              <header className="flex items-center gap-3 border-b border-blue-100/50 pb-4">
                                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                                  <Home size={16} />
                                </div>
                                <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest">House Details</h4>
                              </header>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">BHK</label>
                                  <input 
                                    type="number"
                                    value={formData.bhk}
                                    onChange={e => setFormData({...formData, bhk: e.target.value})}
                                    className="w-full px-4 py-3 bg-white border border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-200 outline-none font-bold text-blue-900"
                                    placeholder="e.g. 3"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">Bathrooms</label>
                                  <input 
                                    type="number"
                                    value={formData.bathrooms}
                                    onChange={e => setFormData({...formData, bathrooms: e.target.value})}
                                    className="w-full px-4 py-3 bg-white border border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-200 outline-none font-bold text-blue-900"
                                    placeholder="e.g. 2"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">House Type</label>
                                  <select 
                                    value={formData.houseType}
                                    onChange={e => setFormData({...formData, houseType: e.target.value as HouseType})}
                                    className="w-full px-4 py-3 bg-white border border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-200 outline-none font-black text-blue-900"
                                  >
                                    <option value="simplex">Simplex</option>
                                    <option value="semi-duplex">Semi-Duplex</option>
                                    <option value="duplex">Duplex</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">Kitchen</label>
                                  <input 
                                    value={formData.kitchenType}
                                    onChange={e => setFormData({...formData, kitchenType: e.target.value})}
                                    className="w-full px-4 py-3 bg-white border border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-200 outline-none font-bold text-blue-900"
                                    placeholder="e.g. Modular"
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </section>
                      </div>

                      {/* Right Column: Measurements & Media */}
                      <div className="space-y-10">
                        {formData.listingMode === 'single' && (
                        <section className="bg-slate-50 rounded-[32px] p-8 border border-slate-100 space-y-6">
                           <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Measurements <span className="text-rose-500">*</span></h4>
                            <div
                              className="grid w-full grid-cols-3 sm:grid-cols-5 gap-1.5 p-1.5 bg-white border border-slate-200 rounded-xl"
                            >
                                {areaUnits.map(u => (
                                    <button
                                        key={u}
                                        type="button"
                                        onClick={() => setFormData({...formData, areaUnit: u})}
                                        className={cn(
                                            "min-w-0 h-8 px-2 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all text-center",
                                            formData.areaUnit === u ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
                                        )}
                                    >
                                        {areaUnitLabels[u]}
                                    </button>
                                ))}
                            </div>
                           </div>

                           <div className="space-y-2">
                             <input 
                                required={formData.listingMode === 'single'}
                                type="number"
                                step="any"
                                value={formData.areaValue}
                                onChange={e => handleAreaChange(e.target.value)}
                                className="w-full px-8 py-6 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-mono font-bold tabular-nums text-2xl text-slate-900 transition-all text-center"
                                placeholder="0.00"
                             />
                           </div>

                           <div className="grid grid-cols-2 gap-3 sm:gap-4">
                              {areaUnits.map(u => {
                                  if (u === formData.areaUnit) return null;
                                  const val = formData.areaValue ? convertArea(Number(formData.areaValue), formData.areaUnit)[u as keyof typeof AREA_CONVERSIONS] : '-';
                                  return (
                                      <div key={u} className="bg-white min-h-[56px] px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-200 flex flex-col items-start justify-center gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                          <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wide">{areaUnitLabels[u]}</p>
                                          <p className="w-full text-right text-xs sm:text-sm font-mono font-bold tabular-nums text-slate-800 break-all">{val}</p>
                                      </div>
                                  )
                              })}
                           </div>
                        </section>
                        )}

                        {formData.listingMode === 'single' && (
                        <section className="space-y-6">
                           <header className="flex items-center justify-between border-b border-slate-100 pb-4">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center">
                                  <ImageIcon size={20} />
                                </div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Photos</h3>
                             </div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase">Optional</p>
                           </header>

                           <div className="grid grid-cols-3 gap-4">
                              {[...files.photos, ...(editingItem?.photos || [])].map((f, i) => (
                                 <div key={i} className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 group">
                                    <img 
                                      src={typeof f === 'string' ? f : URL.createObjectURL(f)} 
                                      className="w-full h-full object-cover" 
                                    />
                                    <button 
                                       type="button"
                                       onClick={() => {
                                          if (typeof f === 'string') {
                                            if (editingItem) {
                                              setEditingItem({...editingItem, photos: editingItem.photos.filter((_, idx) => editingItem.photos[idx] !== f)});
                                            }
                                          } else {
                                            setFiles({...files, photos: files.photos.filter((_, idx) => files.photos[idx] !== f)});
                                          }
                                       }}
                                       className="absolute inset-0 bg-rose-600/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                                    >
                                       <Trash2 size={24} />
                                    </button>
                                 </div>
                              ))}
                              <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 group">
                                 <Upload size={24} className="group-hover:-translate-y-1 transition-transform" />
                                 <span className="text-[9px] font-black uppercase mt-1">Add</span>
                                 <input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                                     if(e.target.files) setFiles({...files, photos: [...files.photos, ...Array.from(e.target.files)]});
                                 }} />
                              </label>
                           </div>
                        </section>
                        )}

                        <section className="space-y-6">
                           <header className="flex items-center justify-between border-b border-slate-100 pb-4">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                                  <Film size={20} />
                                </div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Videos</h3>
                             </div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase">Optional</p>
                           </header>

                           <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                              <div className="relative">
                                <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  type="url"
                                  value={videoLinkInput}
                                  onChange={(e) => setVideoLinkInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      addVideoLink();
                                    }
                                  }}
                                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-700 transition-all"
                                  placeholder="Paste video link (YouTube, Drive, Vimeo, etc.)"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={addVideoLink}
                                className="px-5 py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors"
                              >
                                Add Link
                              </button>
                            </div>

                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {[...files.videos, ...videoLinks, ...(editingItem?.videos || [])].map((video, i) => (
                                 <div key={`video-${i}`} className="relative rounded-2xl overflow-hidden bg-slate-100 group border border-slate-200">
                                    {typeof video === 'string' && !isDirectVideoUrl(video) ? (
                                      <a
                                        href={video}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex h-48 flex-col items-center justify-center gap-3 bg-indigo-50/60 px-5 text-center text-indigo-600 hover:bg-indigo-50 transition-colors"
                                      >
                                        <ExternalLink size={24} />
                                        <span className="text-xs font-black uppercase tracking-widest">Open Video Link</span>
                                        <span className="max-w-full truncate text-[11px] font-bold text-slate-500">{getVideoLinkLabel(video)}</span>
                                      </a>
                                    ) : (
                                      <video
                                        src={typeof video === 'string' ? video : URL.createObjectURL(video)}
                                        controls
                                        preload="metadata"
                                        className="w-full h-48 object-cover bg-black"
                                      />
                                    )}
                                    <button
                                       type="button"
                                       onClick={() => {
                                          if (typeof video === 'string') {
                                            if (videoLinks.includes(video)) {
                                              setVideoLinks(videoLinks.filter((link) => link !== video));
                                            } else if (editingItem) {
                                              setEditingItem({
                                                ...editingItem,
                                                videos: (editingItem.videos || []).filter((_, idx) => (editingItem.videos || [])[idx] !== video)
                                              });
                                            }
                                          } else {
                                            setFiles({
                                              ...files,
                                              videos: files.videos.filter((_, idx) => files.videos[idx] !== video)
                                            });
                                          }
                                       }}
                                       className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    >
                                       <Trash2 size={16} />
                                    </button>
                                 </div>
                              ))}
                              <label className="rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 group min-h-[192px]">
                                 <Upload size={24} className="group-hover:-translate-y-1 transition-transform" />
                                 <span className="text-[10px] font-black uppercase mt-2 tracking-widest">Add Videos</span>
                                 <input
                                   type="file"
                                   accept="video/*"
                                   multiple
                                   className="hidden"
                                   onChange={e => {
                                     if (e.target.files) {
                                       setFiles({ ...files, videos: [...files.videos, ...Array.from(e.target.files)] });
                                     }
                                   }}
                                 />
                              </label>
                           </div>
                           </div>
                        </section>

                        {formData.listingMode === 'project' && (
                          <section className="space-y-6">
                            <header className="flex items-center justify-between border-b border-slate-100 pb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center">
                                  <LayoutGrid size={20} />
                                </div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Project Units</h3>
                              </div>
                              <button
                                type="button"
                                onClick={addProjectUnit}
                                className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors"
                              >
                                Add Unit
                              </button>
                            </header>

                            <div className="space-y-5">
                              {formData.projectUnits.map((unit, unitIndex) => {
                                const unitAreaUnits = Object.keys(AREA_CONVERSIONS) as AreaUnit[];
                                return (
                                  <div key={unit.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Unit {unitIndex + 1}</p>
                                      <button
                                        type="button"
                                        onClick={() => removeProjectUnit(unit.id)}
                                        disabled={formData.projectUnits.length <= 1}
                                        className="text-slate-400 hover:text-rose-500 disabled:opacity-40 transition-colors"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>

                                    <input
                                      value={unit.title}
                                      onChange={(e) => updateProjectUnit(unit.id, { title: e.target.value })}
                                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                                      placeholder="Unit title (e.g. Tower A - Flat 302)"
                                    />

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <select
                                        value={unit.type}
                                        onChange={(e) => {
                                          const nextType = e.target.value as InventoryType;
                                          const defaultSubType = subTypeOptionsByType[nextType]?.[0]?.value || '';
                                          updateProjectUnit(unit.id, { type: nextType, subType: defaultSubType });
                                        }}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700"
                                      >
                                          <option value="house">House/Villa</option>
                                          <option value="zameen">Land</option>
                                          <option value="others">Others</option>
                                        <option value="plot">Plot (Legacy)</option>
                                      </select>
                                      <select
                                        value={unit.subType}
                                        onChange={(e) => updateProjectUnit(unit.id, { subType: e.target.value })}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700"
                                      >
                                        {(subTypeOptionsByType[unit.type] || []).map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        step="any"
                                        value={unit.areaValue}
                                        onChange={(e) => updateProjectUnit(unit.id, { areaValue: e.target.value })}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-mono font-bold text-slate-700"
                                        placeholder="Area"
                                      />
                                      <select
                                        value={unit.areaUnit}
                                        onChange={(e) => updateProjectUnit(unit.id, { areaUnit: e.target.value as AreaUnit })}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700"
                                      >
                                        {unitAreaUnits.map((u) => (
                                          <option key={u} value={u}>
                                            {areaUnitLabels[u]}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        value={unit.rate}
                                        onChange={(e) => updateProjectUnit(unit.id, { rate: e.target.value })}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-mono font-bold text-slate-700"
                                        placeholder="Rate"
                                      />
                                      <input
                                        value={unit.rateUnit}
                                        onChange={(e) => updateProjectUnit(unit.id, { rateUnit: e.target.value })}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                                        placeholder="Rate Unit (total/per_sqft)"
                                      />
                                    </div>

                                    {unit.type === 'house' && (
                                      <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                                        <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">House Details</p>
                                        <div className="grid grid-cols-2 gap-3">
                                          <input
                                            type="number"
                                            value={unit.bhk}
                                            onChange={(e) => updateProjectUnit(unit.id, { bhk: e.target.value })}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                                            placeholder="BHK"
                                          />
                                          <input
                                            type="number"
                                            value={unit.bathrooms}
                                            onChange={(e) => updateProjectUnit(unit.id, { bathrooms: e.target.value })}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                                            placeholder="Bathrooms"
                                          />
                                          <select
                                            value={unit.houseType}
                                            onChange={(e) => updateProjectUnit(unit.id, { houseType: e.target.value as HouseType })}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-700"
                                          >
                                            <option value="simplex">Simplex</option>
                                            <option value="semi-duplex">Semi-Duplex</option>
                                            <option value="duplex">Duplex</option>
                                          </select>
                                          <input
                                            value={unit.kitchenType}
                                            onChange={(e) => updateProjectUnit(unit.id, { kitchenType: e.target.value })}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                                            placeholder="Kitchen Type"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    <div className="space-y-2">
                                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Unit Photos</p>
                                      <div className="grid grid-cols-3 gap-3">
                                        {[...unit.newPhotos, ...unit.photos].map((photo, photoIdx) => {
                                          const isExisting = typeof photo === 'string';
                                          return (
                                            <div key={`${unit.id}-photo-${photoIdx}`} className="relative aspect-square rounded-2xl overflow-hidden bg-slate-200 group">
                                              <img
                                                src={isExisting ? (photo as string) : URL.createObjectURL(photo as File)}
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (isExisting) {
                                                    updateProjectUnit(unit.id, {
                                                      photos: unit.photos.filter((_, idx) => idx !== unit.photos.indexOf(photo as string))
                                                    });
                                                  } else {
                                                    updateProjectUnit(unit.id, {
                                                      newPhotos: unit.newPhotos.filter((_, idx) => idx !== unit.newPhotos.indexOf(photo as File))
                                                    });
                                                  }
                                                }}
                                                className="absolute inset-0 bg-rose-600/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                                              >
                                                <Trash2 size={18} />
                                              </button>
                                            </div>
                                          );
                                        })}
                                        <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 group">
                                          <Upload size={20} className="group-hover:-translate-y-1 transition-transform" />
                                          <span className="text-[9px] font-black uppercase mt-1">Add</span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => {
                                              if (!e.target.files) return;
                                              updateProjectUnit(unit.id, {
                                                newPhotos: [...unit.newPhotos, ...Array.from(e.target.files)]
                                              });
                                            }}
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        )}

                        <section className="space-y-6">
                           <header className="flex items-center justify-between border-b border-slate-100 pb-4">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center">
                                  <File size={20} />
                                </div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Documents</h3>
                             </div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase">Optional</p>
                           </header>

                           <div className="space-y-3">
                              {[...files.attachments, ...(editingItem?.attachments || [])].map((f, i) => (
                                 <div key={i} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group">
                                    <div className="flex items-center gap-3">
                                       <FileText size={20} className="text-indigo-500" />
                                       <p className="text-sm font-bold text-slate-700 truncate max-w-[200px]">
                                          {typeof f === 'object' && 'name' in f ? (f as { name: string }).name : (f as any).name}
                                       </p>
                                    </div>
                                    <button 
                                       type="button"
                                       onClick={() => {
                                          if (typeof f === 'object' && 'url' in f) {
                                            if (editingItem) {
                                              setEditingItem({...editingItem, attachments: editingItem.attachments.filter((_, idx) => editingItem.attachments[idx] !== f)});
                                            }
                                          } else {
                                            setFiles({...files, attachments: files.attachments.filter((_, idx) => files.attachments[idx] !== f)});
                                          }
                                       }}
                                       className="text-slate-400 hover:text-rose-500 transition-colors"
                                    >
                                       <Trash2 size={18} />
                                    </button>
                                 </div>
                              ))}
                              <label className="w-full flex items-center justify-center gap-3 p-6 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-400 hover:text-indigo-600 group">
                                  <Upload size={24} className="group-hover:-translate-y-1 transition-transform" />
                                  <span className="text-xs font-black uppercase tracking-widest">Add Documents</span>
                                  <input 
                                     type="file"
                                     multiple
                                     className="hidden"
                                     onChange={e => {
                                         if(e.target.files) setFiles({...files, attachments: [...files.attachments, ...Array.from(e.target.files)]});
                                     }}
                                  />
                              </label>
                           </div>
                        </section>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 sm:p-4 md:p-5 bg-white border-t border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0">
                  <div className="flex flex-1 gap-3">
                    <button 
                      type="button" 
                      onClick={() => { setShowForm(false); setEditingItem(null); }}
                      className="flex-1 sm:flex-none px-7 py-3 bg-white border border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button" 
                      disabled={loading}
                      onClick={(e) => handleSubmit(e as any, true)}
                      className="flex-1 sm:flex-none px-7 py-3 bg-white border border-slate-200 text-slate-900 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50"
                    >
                      Draft
                    </button>
                  </div>
                  {isAdmin && editingItem?.status === 'pending_approval' && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleApprove(editingItem.id, 'rejected')}
                        className="px-6 py-3 bg-rose-50 border border-rose-200 text-rose-700 font-black text-xs uppercase tracking-[0.15em] rounded-2xl hover:bg-rose-100 transition-all disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleApprove(editingItem.id, 'approved')}
                        className="px-6 py-3 bg-emerald-600 text-white font-black text-xs uppercase tracking-[0.15em] rounded-2xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-[2] py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {loading ? (
                        <>
                            <Clock className="animate-spin" size={18} />
                            Saving...
                        </>
                    ) : (
                        editingItem 
                          ? (editingItem.status === 'draft' ? 'Launch Listing' : 'Save Changes') 
                          : (isAdmin ? 'Live Listing' : 'Submit for Review')
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <InventoryShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        item={selectedShareItem}
        userPhone={user.phone}
      />
    </div>
  );
}

import { auth } from './firebase';
import { OperationType } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const AREA_CONVERSIONS = {
  acre: 1,
  sqft: 43560,
  sqyard: 4840,
  sqmtr: 4046.86,
  hectare: 0.404686
};

export const convertArea = (value: number, from: keyof typeof AREA_CONVERSIONS) => {
  const inAcre = value / AREA_CONVERSIONS[from];
  return {
    acre: Number(inAcre.toFixed(4)),
    sqft: Number((inAcre * AREA_CONVERSIONS.sqft).toFixed(2)),
    sqyard: Number((inAcre * AREA_CONVERSIONS.sqyard).toFixed(2)),
    sqmtr: Number((inAcre * AREA_CONVERSIONS.sqmtr).toFixed(2)),
    hectare: Number((inAcre * AREA_CONVERSIONS.hectare).toFixed(4)),
  };
};

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  const displayMessage = `Operation failed while trying to ${operationType}. Please retry or contact admin.`;
  console.error('Firestore Error:', errInfo);
  return displayMessage;
}

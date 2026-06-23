/** FCM service account — firebase-admin SDK 타입 의존 없음 */
export type FcmServiceAccountCredential = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

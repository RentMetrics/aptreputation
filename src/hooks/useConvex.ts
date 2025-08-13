import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

// Custom hooks for queries
export function useGetUserProperties(userId: string) {
  return useQuery(api.properties.getUserProperties, { userId });
}

export function useGetProperty(propertyId: string) {
  return useQuery(api.properties.getProperty, { propertyId });
}

export function useSearchProperties(searchTerm: string) {
  return useQuery(api.properties.searchProperties, { searchTerm });
}

export function useGetPropertyReviews(propertyId: string) {
  return useQuery(api.reviews.getPropertyReviews, { propertyId });
}

export function useGetReviewsNeedingResponse(propertyId: string) {
  return useQuery(api.reviews.getReviewsNeedingResponse, { propertyId });
}

export function useGetReview(reviewId: string) {
  return useQuery(api.reviews.getReview, { reviewId });
}

export function useGetPropertyAnalysis(propertyId: string) {
  return useQuery(api.aiAnalysis.getPropertyAnalysis, { propertyId });
}

export function useGetLatestAnalysis(propertyId: string) {
  return useQuery(api.aiAnalysis.getLatestAnalysis, { propertyId });
}

export function useGetRecentAudits(limit?: number) {
  return useQuery(api.auditLogs.getRecentAudits, { limit });
}

export function useGetAuditStats() {
  return useQuery(api.auditLogs.getAuditStats);
}

export function useSearchAudits(searchTerm: string) {
  return useQuery(api.auditLogs.searchAudits, { searchTerm });
}

// Actions (for functions that use fetch)
export function useSearchGooglePlaces() {
  return useAction(api.googleApis.searchGooglePlaces);
}

export function useGetGoogleReviews() {
  return useAction(api.googleApis.getGoogleReviews);
}

export function useGetPropertiesNeedingSync() {
  return useQuery(api.propertySync.getPropertiesNeedingSync);
}

export function useGetSyncStatus() {
  return useQuery(api.propertySync.getSyncStatus);
}

// Mutations
export const useCreateProperty = () => useMutation(api.properties.createProperty);
export const useUpdateProperty = () => useMutation(api.properties.updateProperty);
export const useBulkUploadProperties = () => useMutation(api.properties.bulkUploadProperties);
export const useLinkUserToProperty = () => useMutation(api.properties.linkUserToProperty);
export const useUnlinkUserFromProperty = () => useMutation(api.properties.unlinkUserFromProperty);

export const useCreateReview = () => useMutation(api.reviews.createReview);
export const useUpdateReview = () => useMutation(api.reviews.updateReview);
export const useAddAIResponse = () => useMutation(api.reviews.addAIResponse);
export const useMarkReviewResponded = () => useMutation(api.reviews.markReviewResponded);
export const useBulkImportReviews = () => useMutation(api.reviews.bulkImportReviews);
export const useUpdateReviewAnalysis = () => useMutation(api.reviews.updateReviewAnalysis);

export const useCreateAnalysis = () => useMutation(api.aiAnalysis.createAnalysis);
export const useUpdateAnalysis = () => useMutation(api.aiAnalysis.updateAnalysis);
export const useGenerateAIResponse = () => useMutation(api.aiAnalysis.generateAIResponse);
export const useAnalyzeReviews = () => useMutation(api.aiAnalysis.analyzeReviews);

export const useLogAudit = () => useMutation(api.auditLogs.logAudit);

// Actions for Gemini functions
export const useAnalyzeReviewWithGemini = () => useAction(api.googleApis.analyzeReviewWithGemini);
export const useGenerateAIResponseWithGemini = () => useAction(api.googleApis.generateAIResponseWithGemini);
export const useGeneratePropertyAnalysisWithGemini = () => useAction(api.googleApis.generatePropertyAnalysisWithGemini);

export const useSyncPropertyWithGoogle = () => useMutation(api.propertySync.syncPropertyWithGoogle);
export const useSyncAllPropertiesWithGoogle = () => useMutation(api.propertySync.syncAllPropertiesWithGoogle);

// Legacy hook for backward compatibility (deprecated - use individual hooks instead)
export const useConvex = () => {
  console.warn('useConvex is deprecated. Use individual hooks instead.');
  return {
    // Properties
    getUserProperties: useGetUserProperties,
    getProperty: useGetProperty,
    searchProperties: useSearchProperties,
    createProperty: useCreateProperty(),
    updateProperty: useUpdateProperty(),
    bulkUploadProperties: useBulkUploadProperties(),
    linkUserToProperty: useLinkUserToProperty(),
    unlinkUserFromProperty: useUnlinkUserFromProperty(),

    // Reviews
    getPropertyReviews: useGetPropertyReviews,
    getReviewsNeedingResponse: useGetReviewsNeedingResponse,
    getReview: useGetReview,
    createReview: useCreateReview(),
    updateReview: useUpdateReview(),
    addAIResponse: useAddAIResponse(),
    markReviewResponded: useMarkReviewResponded(),
    bulkImportReviews: useBulkImportReviews(),
    updateReviewAnalysis: useUpdateReviewAnalysis(),

    // AI Analysis
    getPropertyAnalysis: useGetPropertyAnalysis,
    getLatestAnalysis: useGetLatestAnalysis,
    createAnalysis: useCreateAnalysis(),
    updateAnalysis: useUpdateAnalysis(),
    generateAIResponse: useGenerateAIResponse(),
    analyzeReviews: useAnalyzeReviews(),

    // Audit Logs
    logAudit: useLogAudit(),
    getRecentAudits: useGetRecentAudits,
    getAuditStats: useGetAuditStats,
    searchAudits: useSearchAudits,

    // Google APIs (now actions)
    searchGooglePlaces: useSearchGooglePlaces(),
    getGoogleReviews: useGetGoogleReviews(),
    analyzeReviewWithGemini: useAnalyzeReviewWithGemini(),
    generateAIResponseWithGemini: useGenerateAIResponseWithGemini(),
    generatePropertyAnalysisWithGemini: useGeneratePropertyAnalysisWithGemini(),

    // Property Sync
    syncPropertyWithGoogle: useSyncPropertyWithGoogle(),
    syncAllPropertiesWithGoogle: useSyncAllPropertiesWithGoogle(),
    getPropertiesNeedingSync: useGetPropertiesNeedingSync,
    getSyncStatus: useGetSyncStatus,
  };
}; 
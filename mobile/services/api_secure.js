/**
 * ULTRA PROTECTION API Service
 * ==============================
 * 
 * Secure evidence API functions with role-based access control.
 * All endpoints enforce strict RBAC on backend.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveBaseUrl } from './api'; // FIX: was getDebugInfo — resolveBaseUrl handles EAS env vars correctly

/**
 * Get authentication headers with current user token
 */
async function authHeaders() {
  const token = await AsyncStorage.getItem('userToken');
  if (!token) {
    throw new Error('Not authenticated');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

// FIX: removed broken sync getBaseUrl() that fell back to 'http://localhost:8000'.
// All functions now call `await resolveBaseUrl()` directly instead.

/**
 * Get all evidence with role-based filtering
 * 
 * - ADMIN: All evidence
 * - VIEWER: Only evidence from own cameras
 * - SECURITY: Only shared evidence
 * 
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getSecureEvidence() {
  try {
    const baseUrl = await resolveBaseUrl(); // FIX
    const headers = await authHeaders();
    
    console.log('[API Secure] Fetching evidence from:', `${baseUrl}/api/v1/evidence-secure/`);
    
    const res = await fetch(`${baseUrl}/api/v1/evidence-secure/`, {
      method: 'GET',
      headers
    });
    
    console.log('[API Secure] Response status:', res.status);
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
      return {
        success: false,
        message: errorData.detail || `HTTP ${res.status}`,
        status: res.status
      };
    }
    
    const data = await res.json();
    console.log('[API Secure] ✅ Received', data.length, 'evidence items');
    
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('[API Secure] ❌ Error:', error);
    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}

/**
 * Get single evidence by ID with access control check
 * 
 * @param {number} evidenceId 
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getSecureEvidenceById(evidenceId) {
  try {
    const baseUrl = await resolveBaseUrl(); // FIX
    const headers = await authHeaders();
    
    const res = await fetch(`${baseUrl}/api/v1/evidence-secure/${evidenceId}`, {
      method: 'GET',
      headers
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
      return {
        success: false,
        message: errorData.detail || `HTTP ${res.status}`,
        status: res.status
      };
    }
    
    const data = await res.json();
    
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('[API Secure] Error getting evidence:', error);
    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}

/**
 * Verify evidence integrity against blockchain (ADMIN ONLY)
 * 
 * Recalculates file hash and compares with blockchain record.
 * Returns verification status: VERIFIED, TAMPERED, or FILE_MISSING
 * 
 * @param {number} evidenceId 
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function verifySecureEvidence(evidenceId) {
  try {
    const baseUrl = await resolveBaseUrl(); // FIX
    const headers = await authHeaders();
    
    console.log('[API Secure] Verifying evidence:', evidenceId);
    
    const res = await fetch(`${baseUrl}/api/v1/evidence-secure/${evidenceId}/verify`, {
      method: 'POST',
      headers
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
      
      if (res.status === 403) {
        return {
          success: false,
          message: 'Permission denied. Only administrators can verify evidence.',
          status: 403
        };
      }
      
      return {
        success: false,
        message: errorData.detail || `HTTP ${res.status}`,
        status: res.status
      };
    }
    
    const data = await res.json();
    console.log('[API Secure] Verification result:', data.status);
    
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('[API Secure] ❌ Verification error:', error);
    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}

/**
 * Share evidence with security role (ADMIN ONLY)
 * 
 * @param {number} evidenceId 
 * @param {number} securityUserId 
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function shareEvidenceWithSecurity(evidenceId, securityUserId) {
  try {
    const baseUrl = await resolveBaseUrl(); // FIX
    const headers = await authHeaders();
    
    console.log('[API Secure] Sharing evidence', evidenceId, 'with user', securityUserId);
    
    const res = await fetch(`${baseUrl}/api/v1/evidence-secure/share`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        evidence_id: evidenceId,
        shared_with_user_id: securityUserId
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
      
      if (res.status === 403) {
        return {
          success: false,
          message: 'Permission denied. Only administrators can share evidence.',
          status: 403
        };
      }
      
      return {
        success: false,
        message: errorData.detail || `HTTP ${res.status}`,
        status: res.status
      };
    }
    
    const data = await res.json();
    console.log('[API Secure] ✅ Evidence shared successfully');
    
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('[API Secure] ❌ Share error:', error);
    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}

/**
 * Get audit trail for evidence (ADMIN ONLY)
 * 
 * Returns complete audit log showing all access, verification, and sharing events.
 * 
 * @param {number} evidenceId 
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getEvidenceAuditTrail(evidenceId) {
  try {
    const baseUrl = await resolveBaseUrl(); // FIX
    const headers = await authHeaders();
    
    const res = await fetch(`${baseUrl}/api/v1/evidence-secure/audit/${evidenceId}`, {
      method: 'GET',
      headers
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
      return {
        success: false,
        message: errorData.detail || `HTTP ${res.status}`,
        status: res.status
      };
    }
    
    const data = await res.json();
    
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('[API Secure] Error getting audit trail:', error);
    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}

/**
 * Get evidence security statistics (ADMIN ONLY)
 * 
 * Returns:
 * - Total evidence count
 * - Verification status breakdown
 * - Tampered evidence count
 * - Recent audit activity
 * 
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getEvidenceSecurityStats() {
  try {
    const baseUrl = await resolveBaseUrl(); // FIX
    const headers = await authHeaders();
    
    const res = await fetch(`${baseUrl}/api/v1/evidence-secure/stats/summary`, {
      method: 'GET',
      headers
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
      return {
        success: false,
        message: errorData.detail || `HTTP ${res.status}`,
        status: res.status
      };
    }
    
    const data = await res.json();
    
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('[API Secure] Error getting stats:', error);
    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}
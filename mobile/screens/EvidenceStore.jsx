import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';
import { getMyEvidence, verifyEvidence, getDebugInfo, getEvidenceStats } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function EvidenceStore({ navigation }) {
  console.log('[EvidenceStore] 🔵 Component rendering...');
  
  const tailwind = useTailwind();
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    console.log('[EvidenceStore] 🟢 useEffect triggered - mounting component');
    console.log('[EvidenceStore] Current time:', new Date().toISOString());
    
    const initialize = async () => {
      console.log('[EvidenceStore] 🚀 Starting initialization sequence...');
      console.log('[EvidenceStore] Step 1: Init base URL');
      const url = await initBaseUrl();
      
      console.log('[EvidenceStore] Step 2: Load user role');
      await loadUserRole();
      
      console.log('[EvidenceStore] Step 3: Fetch evidence');
      console.log('[EvidenceStore] ✅ Initialization complete, now fetching evidence...');
      await fetchEvidence();
    };
    
    initialize().catch(err => {
      console.error('[EvidenceStore] ❌ Initialization failed:', err);
    });
    
    return () => {
      console.log('[EvidenceStore] 🔴 Component unmounting');
    };
  }, []);

  const initBaseUrl = async () => {
    console.log('[EvidenceStore] 📍 Initializing base URL...');
    const debugInfo = getDebugInfo();
    const url = debugInfo.BASE_URL || 'http://localhost:8000';
    console.log('[EvidenceStore] Debug info:', debugInfo);
    console.log('[EvidenceStore] Setting BASE_URL to:', url);
    setBaseUrl(url);
    console.log('[EvidenceStore] ✅ BASE_URL state updated');
    return url; // Return the URL for use in initialize
  };
  
  const loadUserRole = async () => {
    console.log('[EvidenceStore] 👤 Loading user role...');
    try {
      const role = await AsyncStorage.getItem('userRole');
      console.log('[EvidenceStore] User role from storage:', role);
      setUserRole(role);
      
      // If no role found, try to get from other token keys
      if (!role) {
        console.log('[EvidenceStore] ⚠️ No role in storage, checking tokens...');
        const viewerToken = await AsyncStorage.getItem('viewerToken');
        const adminToken = await AsyncStorage.getItem('adminToken');
        const securityToken = await AsyncStorage.getItem('securityToken');
        
        console.log('[EvidenceStore] Token check - viewer:', !!viewerToken, 'admin:', !!adminToken, 'security:', !!securityToken);
        
        if (viewerToken) {
          console.log('[EvidenceStore] Setting role to viewer');
          setUserRole('viewer');
        } else if (adminToken) {
          console.log('[EvidenceStore] Setting role to admin');
          setUserRole('admin');
        } else if (securityToken) {
          console.log('[EvidenceStore] Setting role to security');
          setUserRole('security');
        } else {
          console.log('[EvidenceStore] ❌ No tokens found at all!');
        }
      }
      console.log('[EvidenceStore] ✅ User role loaded successfully');
    } catch (err) {
      console.error('[EvidenceStore] ❌ Failed to load user role:', err);
    }
  };

  const fetchEvidence = async () => {
    try {
      console.log('[EvidenceStore] ========================================');
      console.log('[EvidenceStore] 🔄 FETCH EVIDENCE - START');
      console.log('[EvidenceStore] ========================================');
      console.log('[EvidenceStore] Setting loading to TRUE');
      setLoading(true);
      
      // Step 1: Check authentication
      console.log('[EvidenceStore] 🔐 Step 1: Checking authentication...');
      const viewerToken = await AsyncStorage.getItem('viewerToken');
      const adminToken = await AsyncStorage.getItem('adminToken');
      const securityToken = await AsyncStorage.getItem('securityToken');
      
      if (!viewerToken && !adminToken && !securityToken) {
        console.error('[EvidenceStore] ❌ ERROR: No authentication tokens found!');
        Alert.alert('Authentication Error', 'Please login again to view evidence.');
        setLoading(false);
        return;
      }
      console.log('[EvidenceStore] ✅ Step 1 PASSED: Token found');
      console.log('[EvidenceStore] Token types available:', {
        viewer: !!viewerToken,
        admin: !!adminToken,
        security: !!securityToken
      });
      
      // Step 2: Check base URL
      console.log('[EvidenceStore] 🌐 Step 2: Checking base URL...');
      
      // Get baseUrl directly from getDebugInfo to avoid state timing issues
      const debugInfo = getDebugInfo();
      const currentBaseUrl = debugInfo.BASE_URL || baseUrl || 'http://localhost:8000';
      
      console.log('[EvidenceStore] baseUrl from state:', baseUrl);
      console.log('[EvidenceStore] baseUrl from getDebugInfo:', debugInfo.BASE_URL);
      console.log('[EvidenceStore] Using baseUrl:', currentBaseUrl);
      
      if (!currentBaseUrl) {
        console.error('[EvidenceStore] ❌ ERROR: baseUrl is empty!');
        console.error('[EvidenceStore] This means initBaseUrl() failed or wasn\'t called');
        setLoading(false);
        return;
      }
      console.log('[EvidenceStore] ✅ Step 2 PASSED: Base URL =', currentBaseUrl);
      
      // Step 3: Call API
      console.log('[EvidenceStore] 📞 Step 3: Calling getMyEvidence API...');
      console.log('[EvidenceStore] Expected URL: ' + currentBaseUrl + '/api/v1/evidence/my/all');
      
      console.log('[EvidenceStore] About to call getMyEvidence()...');
      const res = await getMyEvidence();
      console.log('[EvidenceStore] getMyEvidence() returned!');
      
      console.log('[EvidenceStore] 📦 Step 4: API Response Analysis');
      console.log('[EvidenceStore] ========================================');
      console.log('[EvidenceStore] Full response object:', JSON.stringify(res, null, 2));
      console.log('[EvidenceStore] Response Object:', {
        success: res.success,
        status: res.status,
        hasMessage: !!res.message,
        message: res.message,
        hasData: !!res.data,
        dataType: res.data ? typeof res.data : 'undefined',
        isArray: Array.isArray(res.data),
        dataLength: Array.isArray(res.data) ? res.data.length : 'N/A'
      });
      
      // Step 4: Validate response structure
      if (!res) {
        console.error('[EvidenceStore] ❌ ERROR: API returned null/undefined response!');
        console.error('[EvidenceStore] This is a critical error - API call failed completely');
        Alert.alert('Error', 'Failed to fetch evidence: No response from server');
        return;
      }
      
      if (typeof res.success === 'undefined') {
        console.error('[EvidenceStore] ❌ ERROR: Response missing "success" property!');
        console.error('[EvidenceStore] Response structure:', JSON.stringify(res, null, 2));
        Alert.alert('Error', 'Invalid response format from server');
        return;
      }
      
      // Step 5: Handle success/failure
      if (res.success) {
        console.log('[EvidenceStore] ✅ Step 5 PASSED: API call successful');
        
        // Validate data array
        if (!res.data) {
          console.warn('[EvidenceStore] ⚠️ WARNING: res.data is null/undefined, using empty array');
          setEvidence([]);
        } else if (!Array.isArray(res.data)) {
          console.error('[EvidenceStore] ❌ ERROR: res.data is not an array!');
          console.error('[EvidenceStore] res.data type:', typeof res.data);
          console.error('[EvidenceStore] res.data content:', JSON.stringify(res.data, null, 2));
          Alert.alert('Error', 'Invalid data format received from server');
          return;
        } else {
          const itemCount = res.data.length;
          console.log('[EvidenceStore] ✅ SUCCESS! Received', itemCount, 'evidence items');
          
          if (itemCount > 0) {
            // Validate first evidence item structure
            const firstItem = res.data[0];
            console.log('[EvidenceStore] 📄 First evidence item structure check:');
            console.log('[EvidenceStore]   - id:', firstItem.id, typeof firstItem.id);
            console.log('[EvidenceStore]   - incident_id:', firstItem.incident_id, typeof firstItem.incident_id);
            console.log('[EvidenceStore]   - file_path:', firstItem.file_path, typeof firstItem.file_path);
            console.log('[EvidenceStore]   - created_at:', firstItem.created_at, typeof firstItem.created_at);
            console.log('[EvidenceStore]   - blockchain_tx_hash:', firstItem.blockchain_tx_hash);
            console.log('[EvidenceStore]   - verification_status:', firstItem.verification_status);
            
            // Check for required fields
            const requiredFields = ['id', 'incident_id', 'file_path', 'created_at'];
            const missingFields = requiredFields.filter(field => !firstItem[field]);
            
            if (missingFields.length > 0) {
              console.error('[EvidenceStore] ❌ ERROR: Evidence item missing required fields:', missingFields);
              console.error('[EvidenceStore] Full item:', JSON.stringify(firstItem, null, 2));
            } else {
              console.log('[EvidenceStore] ✅ Evidence item structure validated');
            }
            
            // Validate file path
            if (!firstItem.file_path) {
              console.error('[EvidenceStore] ❌ ERROR: file_path is empty!');
            } else if (firstItem.file_path.includes('\\')) {
              console.warn('[EvidenceStore] ⚠️ WARNING: file_path contains backslashes, may cause URL issues');
              console.warn('[EvidenceStore] file_path:', firstItem.file_path);
            }
            
            // Log constructed URL for first item
            const testUrl = getImageUrl(firstItem.file_path);
            console.log('[EvidenceStore] 🖼️ Test image URL construction:');
            console.log('[EvidenceStore]   Input file_path:', firstItem.file_path);
            console.log('[EvidenceStore]   Output URL:', testUrl);
          } else {
            console.log('[EvidenceStore] ⚠️ No evidence data received (empty array)');
            console.log('[EvidenceStore] This is normal if no evidence exists yet');
          }
          
          setEvidence(res.data);
          console.log('[EvidenceStore] ✅ Evidence state updated with', itemCount, 'items');
        }
        
        // Auto-fetch stats if no evidence
        if (!res.data || res.data.length === 0) {
          console.log('[EvidenceStore] 📊 Triggering stats fetch (no evidence found)...');
          fetchStats();
        }
      } else {
        // API call failed
        console.error('[EvidenceStore] ❌ Step 5 FAILED: API call unsuccessful');
        console.error('[EvidenceStore] Error message:', res.message);
        console.error('[EvidenceStore] Status code:', res.status);
        
        // Detailed error analysis
        if (res.status === 401) {
          console.error('[EvidenceStore] 🔒 AUTHORIZATION ERROR');
          console.error('[EvidenceStore] Token expired or invalid');
          Alert.alert(
            'Session Expired',
            'Please login again to view evidence.',
            [{ text: 'OK', onPress: () => navigation.navigate('ViewerLogin') }]
          );
        } else if (res.status === 403) {
          console.error('[EvidenceStore] 🚫 FORBIDDEN ERROR');
          console.error('[EvidenceStore] User does not have permission');
          Alert.alert('Permission Denied', res.message || 'You do not have access to evidence');
        } else if (res.status === 404) {
          console.error('[EvidenceStore] 📭 NOT FOUND ERROR');
          console.error('[EvidenceStore] Endpoint may not exist');
          Alert.alert('Error', 'Evidence endpoint not found');
        } else if (res.status === 500) {
          console.error('[EvidenceStore] 💥 SERVER ERROR');
          console.error('[EvidenceStore] Backend crashed or database issue');
          Alert.alert('Server Error', 'Backend server error. Check server logs.');
        } else if (res.status === 0) {
          console.error('[EvidenceStore] 🌐 NETWORK ERROR');
          console.error('[EvidenceStore] Cannot connect to backend');
          Alert.alert('Connection Error', 'Cannot connect to backend server. Is it running?');
        } else {
          console.error('[EvidenceStore] ⁉️ UNKNOWN ERROR');
          console.error('[EvidenceStore] Unexpected status code:', res.status);
          Alert.alert('Error', res.message || 'Failed to load evidence');
        }
      }
    } catch (error) {
      console.error('[EvidenceStore] ========================================');
      console.error('[EvidenceStore] ❌ ❌ ❌ EXCEPTION IN fetchEvidence ❌ ❌ ❌');
      console.error('[EvidenceStore] ========================================');
      console.error('[EvidenceStore] Error type:', error.constructor.name);
      console.error('[EvidenceStore] Error message:', error.message);
      console.error('[EvidenceStore] Error stack:', error.stack);
      
      // Categorize error type
      if (error.message.includes('fetch')) {
        console.error('[EvidenceStore] 🌐 FETCH ERROR - Network request failed');
      } else if (error.message.includes('JSON')) {
        console.error('[EvidenceStore] 📋 JSON PARSE ERROR - Invalid response format');
      } else if (error.message.includes('undefined')) {
        console.error('[EvidenceStore] ❓ UNDEFINED ERROR - Accessing undefined property');
      }
      
      Alert.alert('Error', 'Failed to load evidence: ' + error.message);
    } finally {
      console.log('[EvidenceStore] 🏁 Setting loading to FALSE');
      setLoading(false);
      console.log('[EvidenceStore] ========================================');
      console.log('[EvidenceStore] FETCH EVIDENCE - COMPLETE');
      console.log('[EvidenceStore] ========================================');
    }
  };

  const fetchStats = async () => {
    console.log('[EvidenceStore] 📊 Fetching stats...');
    const res = await getEvidenceStats();
    
    if (res.success) {
      console.log('[EvidenceStore] ✅ Stats received:', JSON.stringify(res.data, null, 2));
      setStats(res.data);
      
      // Build alert message
      let message = `Your Account:\n` +
        `• Role: ${res.data.user?.role || 'unknown'}\n` +
        `• Cameras Owned: ${res.data.user?.cameras_owned || 0}\n` +
        `• Camera IDs: ${res.data.user?.camera_ids?.join(', ') || 'none'}\n` +
        `• Your Incidents: ${res.data.user?.incidents_from_cameras || 0}\n` +
        `• Your Evidence: ${res.data.user?.evidence_from_cameras || 0}\n\n` +
        `Database:\n` +
        `• Total Cameras: ${res.data.database?.total_cameras || 0}\n` +
        `• Total Incidents: ${res.data.database?.total_incidents || 0}\n` +
        `• Total Evidence: ${res.data.database?.total_evidence || 0}`;
      
      // Add recent incidents info if available
      if (res.data.recent_incidents && res.data.recent_incidents.length > 0) {
        message += `\n\nRecent Incidents:`;
        res.data.recent_incidents.forEach((inc, idx) => {
          message += `\n${idx + 1}. ID:${inc.incident_id} Cam:${inc.camera_id} Owner:${inc.camera_owner_name || 'N/A'} Evidence:${inc.evidence_count}`;
        });
      }
      
      console.log('[EvidenceStore] 📊 Stats message prepared');
      Alert.alert('📊 Evidence Debug Info', message, [{ text: 'OK' }]);
    } else {
      console.error('[EvidenceStore] ❌ Stats fetch failed:', res.message);
      Alert.alert('Error', 'Failed to fetch stats: ' + res.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEvidence();
    setRefreshing(false);
  };

  const handleVerifyEvidence = async (evidenceId) => {
    // Check if user can verify (Admin and User roles only, not Security)
    if (userRole === 'security') {
      Alert.alert('Permission Denied', 'Security role cannot verify evidence');
      return;
    }
    
    if (!userRole || (userRole !== 'admin' && userRole !== 'viewer')) {
      Alert.alert('Permission Denied', 'You do not have permission to verify evidence');
      return;
    }
    
    Alert.alert(
      'Verify Evidence',
      'Verify this evidence on the blockchain?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify',
          onPress: async () => {
            setLoading(true);
            const res = await verifyEvidence(evidenceId);
            setLoading(false);
            
            if (res.success) {
              const status = res.data.status;
              const icon = status === 'VERIFIED' ? '✅' : '❌';
              Alert.alert(
                `${icon} ${status}`,
                res.data.message,
                [{ text: 'OK', onPress: () => fetchEvidence() }] // Refresh to get updated status
              );
            } else {
              Alert.alert('Verification Failed', res.message || 'Could not verify evidence');
            }
          }
        }
      ]
    );
  };

  const getImageUrl = (filePath) => {
    console.log('[getImageUrl] 🖼️ Constructing image URL...');
    console.log('[getImageUrl] Input filePath:', filePath, 'Type:', typeof filePath);
    console.log('[getImageUrl] baseUrl:', baseUrl);
    
    // Validation checks
    if (!filePath) {
      console.warn('[getImageUrl] ⚠️ WARNING: filePath is null/undefined/empty');
      return null;
    }
    
    if (!baseUrl) {
      console.error('[getImageUrl] ❌ ERROR: baseUrl is not set!');
      console.error('[getImageUrl] Cannot construct URL without baseUrl');
      return null;
    }
    
    // Check for common path issues
    if (filePath.includes('\\')) {
      console.warn('[getImageUrl] ⚠️ WARNING: filePath contains backslashes!');
      console.warn('[getImageUrl] Original:', filePath);
      filePath = filePath.replace(/\\/g, '/');
      console.warn('[getImageUrl] Corrected:', filePath);
    }
    
    if (filePath.startsWith('/')) {
      console.warn('[getImageUrl] ⚠️ WARNING: filePath starts with slash, removing it');
      filePath = filePath.substring(1);
    }
    
    // Construct URL
    const url = `${baseUrl}/evidence/${filePath}`;
    console.log('[getImageUrl] ✅ Constructed URL:', url);
    
    // Validate URL format
    try {
      new URL(url);
      console.log('[getImageUrl] ✅ URL format is valid');
    } catch (error) {
      console.error('[getImageUrl] ❌ ERROR: Invalid URL format!');
      console.error('[getImageUrl] URL:', url);
      console.error('[getImageUrl] Error:', error.message);
    }
    
    return url;
  };

  const getVerificationBadge = (item) => {
    if (!item.blockchain_tx_hash) {
      return { text: 'Not on Blockchain', color: 'bg-gray-400' };
    }
    
    switch (item.verification_status) {
      case 'VERIFIED':
        return { text: '✅ Verified', color: 'bg-green-500' };
      case 'TAMPERED':
        return { text: '❌ Tampered', color: 'bg-red-500' };
      case 'PENDING':
      default:
        return { text: '⏳ Pending', color: 'bg-yellow-500' };
    }
  };

  const renderItem = ({ item }) => {
    try {
      console.log('[renderItem] 🎨 Rendering evidence item:', item.id);
      
      // Validate item structure
      if (!item) {
        console.error('[renderItem] ❌ ERROR: Item is null/undefined');
        return null;
      }
      
      if (!item.id || !item.incident_id || !item.file_path) {
        console.error('[renderItem] ❌ ERROR: Item missing required fields');
        console.error('[renderItem] Item:', JSON.stringify(item, null, 2));
        return (
          <View style={tailwind('mb-4 bg-red-50 border border-red-200 rounded-lg p-3')}>
            <Text style={tailwind('text-red-600 text-sm')}>
              ⚠️ Invalid evidence data (missing required fields)
            </Text>
          </View>
        );
      }
      
      const imageUrl = getImageUrl(item.file_path);
      const badge = getVerificationBadge(item);
      
      let timestamp;
      try {
        timestamp = new Date(item.created_at).toLocaleString();
      } catch (dateError) {
        console.error('[renderItem] ❌ Date parse error:', dateError);
        timestamp = item.created_at || 'Unknown date';
      }
      
      const canVerify = userRole === 'admin' || userRole === 'viewer';
      console.log('[renderItem] ✅ Rendering evidence #' + item.id + ' complete');

      return (
      <View style={tailwind('mb-4 bg-white rounded-lg p-3 border border-sky-100 shadow')}>
        {/* Header */}
        <View style={tailwind('flex-row justify-between items-center mb-2')}>
          <Text style={tailwind('font-semibold text-sky-800')}>
            Incident #{item.incident_id}
          </Text>
          <View style={tailwind(`px-2 py-1 rounded ${badge.color}`)}>
            <Text style={tailwind('text-xs text-white font-bold')}>{badge.text}</Text>
          </View>
        </View>

        {/* Image */}
        {imageUrl && (
          <Image 
            source={{ uri: imageUrl }} 
            style={{ width: '100%', height: 180, borderRadius: 8, backgroundColor: '#f0f0f0' }} 
            resizeMode="cover"
            onError={(e) => {
              console.error('[EvidenceStore] ========================================');
              console.error('[EvidenceStore] ❌ IMAGE LOAD ERROR');
              console.error('[EvidenceStore] ========================================');
              console.error('[EvidenceStore] Evidence ID:', item.id);
              console.error('[EvidenceStore] Incident ID:', item.incident_id);
              console.error('[EvidenceStore] file_path:', item.file_path);
              console.error('[EvidenceStore] Constructed URL:', imageUrl);
              console.error('[EvidenceStore] Error object:', e.nativeEvent);
              console.error('[EvidenceStore] Error message:', e.nativeEvent.error);
              console.error('[EvidenceStore] ========================================');
              console.error('[EvidenceStore] TROUBLESHOOTING STEPS:');
              console.error('[EvidenceStore] 1. Check if file exists on backend server');
              console.error('[EvidenceStore] 2. Verify backend is serving /evidence/ static files');
              console.error('[EvidenceStore] 3. Check file permissions');
              console.error('[EvidenceStore] 4. Verify file path matches actual file location');
              console.error('[EvidenceStore] Expected file location: ai_worker/data/captures/' + item.file_path);
              console.error('[EvidenceStore] ========================================');
            }}
            onLoadStart={() => console.log('[EvidenceStore] 🔄 Image load started for:', imageUrl)}
            onLoadEnd={() => console.log('[EvidenceStore] ✅ Image load completed for:', imageUrl)}
          />
        )}
        {!imageUrl && (
          <View style={tailwind('w-full h-40 bg-gray-200 rounded-lg items-center justify-center')}>
            <Ionicons name="image-outline" size={48} color="#9CA3AF" />
            <Text style={tailwind('text-gray-500 text-xs mt-2')}>No image URL</Text>
          </View>
        )}

        {/* Details */}
        <View style={tailwind('mt-2')}>
          <Text style={tailwind('text-xs text-gray-600')}>{timestamp}</Text>
          {item.blockchain_tx_hash && (
            <Text style={tailwind('text-xs text-sky-600 mt-1')} numberOfLines={1}>
              TX: {item.blockchain_tx_hash.substring(0, 20)}...
            </Text>
          )}
        </View>

        {/* Verify button for Admin and User roles */}
        {canVerify && item.blockchain_tx_hash && (
          <TouchableOpacity
            onPress={() => handleVerifyEvidence(item.id)}
            style={tailwind('mt-3 bg-indigo-600 py-2 px-4 rounded-lg flex-row items-center justify-center')}
          >
            <Ionicons name="shield-checkmark" size={16} color="#FFFFFF" />
            <Text style={tailwind('ml-2 text-white font-semibold text-sm')}>
              Verify Evidence
            </Text>
          </TouchableOpacity>
        )}
        
        {/* Message for evidence without blockchain */}
        {canVerify && !item.blockchain_tx_hash && (
          <View style={tailwind('mt-3 bg-yellow-100 border border-yellow-400 rounded-lg p-2')}>
            <View style={tailwind('flex-row items-center')}>
              <Ionicons name="information-circle" size={16} color="#D97706" />
              <Text style={tailwind('ml-2 text-xs text-yellow-800')}>
                Not on blockchain
              </Text>
            </View>
          </View>
        )}
      </View>
    );
    } catch (error) {
      console.error('[renderItem] ========================================');
      console.error('[renderItem] ❌ RENDER ERROR');
      console.error('[renderItem] ========================================');
      console.error('[renderItem] Error rendering evidence item');
      console.error('[renderItem] Error type:', error.constructor.name);
      console.error('[renderItem] Error message:', error.message);
      console.error('[renderItem] Error stack:', error.stack);
      console.error('[renderItem] Item that caused error:', JSON.stringify(item, null, 2));
      console.error('[renderItem] ========================================');
      
      return (
        <View style={tailwind('mb-4 bg-red-50 border border-red-200 rounded-lg p-3')}>
          <View style={tailwind('flex-row items-center mb-2')}>
            <Ionicons name="alert-circle" size={20} color="#DC2626" />
            <Text style={tailwind('ml-2 text-red-600 font-semibold')}>
              Error Rendering Evidence
            </Text>
          </View>
          <Text style={tailwind('text-red-500 text-xs')}>
            Evidence ID: {item?.id || 'Unknown'}
          </Text>
          <Text style={tailwind('text-red-500 text-xs')}>
            Error: {error.message}
          </Text>
        </View>
      );
    }
  };

  // Loading screen check
  if (loading && !refreshing) {
    console.log('[EvidenceStore] 🔄 Rendering loading screen...');
    return (
      <View style={tailwind('flex-1 bg-sky-50 justify-center items-center')}>
        <ActivityIndicator size="large" color="#0369a1" />
        <Text style={tailwind('mt-2 text-sky-700')}>Loading evidence...</Text>
      </View>
    );
  }

  console.log('[EvidenceStore] 🎨 Rendering main content. Evidence count:', evidence.length);
  
  return (
    <View style={tailwind('flex-1 bg-sky-50 p-4')}>
      <View style={tailwind('flex-row justify-between items-center mb-4')}>
        <Text style={tailwind('text-2xl font-bold text-sky-700')}>Evidence Store</Text>
        
        {/* Debug Button */}
        <TouchableOpacity 
          onPress={fetchStats}
          style={tailwind('bg-sky-600 rounded-lg px-3 py-2')}
        >
          <Text style={tailwind('text-white font-semibold text-xs')}>🐛 Debug</Text>
        </TouchableOpacity>
      </View>
      
      {evidence.length === 0 ? (
        <View style={tailwind('flex-1 justify-center items-center px-6')}>
          <Ionicons name="folder-open-outline" size={64} color="#94a3b8" style={tailwind('mb-4')} />
          <Text style={tailwind('text-sky-700 text-lg font-bold text-center mb-2')}>
            No Evidence Found
          </Text>
          <Text style={tailwind('text-sky-600 text-center mb-4')}>
            {stats 
              ? (stats.user?.evidence_from_cameras === 0 
                  ? "Your cameras have incidents but no evidence files were saved. Check if AI worker is running and saving evidence." 
                  : "Evidence will appear here when incidents are detected by your cameras.")
              : "Evidence will appear here when incidents are detected by your cameras."}
          </Text>
          
          {/* Show diagnostic info if available */}
          {stats && stats.user && (
            <View style={tailwind('bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 w-full')}>
              <View style={tailwind('flex-row items-center mb-2')}>
                <Ionicons name="information-circle" size={20} color="#D97706" />
                <Text style={tailwind('ml-2 text-yellow-900 font-semibold')}>Quick Diagnostic</Text>
              </View>
              <Text style={tailwind('text-yellow-800 text-xs mb-1')}>
                ✓ You own {stats.user.cameras_owned || 0} camera(s)
              </Text>
              <Text style={tailwind('text-yellow-800 text-xs mb-1')}>
                ✓ {stats.user.incidents_from_cameras || 0} incident(s) from your cameras
              </Text>
              <Text style={tailwind('text-yellow-800 text-xs mb-1')}>
                {stats.user.evidence_from_cameras > 0 ? '✓' : '✗'} {stats.user.evidence_from_cameras || 0} evidence file(s) saved
              </Text>
              {stats.user.evidence_from_cameras === 0 && stats.user.incidents_from_cameras > 0 && (
                <Text style={tailwind('text-red-600 text-xs mt-2 font-semibold')}>
                  ⚠️ Incidents exist but no evidence files! Check AI worker logs.
                </Text>
              )}
            </View>
          )}
          
          {/* Debug Stats */}
          {stats && (
            <View style={tailwind('bg-white rounded-lg p-4 mb-4 w-full border border-sky-200')}>
              <Text style={tailwind('text-sky-700 font-bold mb-2 text-center')}>📊 Debug Info</Text>
              
              <View style={tailwind('bg-sky-50 rounded p-2 mb-2')}>
                <Text style={tailwind('text-sky-700 text-xs font-semibold')}>Your Account:</Text>
                <Text style={tailwind('text-sky-600 text-xs')}>
                  • Role: {stats.user?.role?.toUpperCase()}
                </Text>
                <Text style={tailwind('text-sky-600 text-xs')}>
                  • Cameras Owned: {stats.user?.cameras_owned || 0}
                </Text>
                {stats.user?.camera_ids && stats.user.camera_ids.length > 0 && (
                  <Text style={tailwind('text-sky-600 text-xs')}>
                    • Camera IDs: {stats.user.camera_ids.join(', ')}
                  </Text>
                )}
                <Text style={tailwind('text-sky-600 text-xs')}>
                  • Your Incidents: {stats.user?.incidents_from_cameras || 0}
                </Text>
                <Text style={tailwind('text-sky-600 text-xs')}>
                  • Your Evidence: {stats.user?.evidence_from_cameras || 0}
                </Text>
              </View>
              
              <View style={tailwind('bg-gray-50 rounded p-2')}>
                <Text style={tailwind('text-gray-700 text-xs font-semibold')}>Database Totals:</Text>
                <Text style={tailwind('text-gray-600 text-xs')}>
                  • Total Cameras: {stats.database?.total_cameras || 0}
                </Text>
                <Text style={tailwind('text-gray-600 text-xs')}>
                  • Total Incidents: {stats.database?.total_incidents || 0}
                </Text>
                <Text style={tailwind('text-gray-600 text-xs')}>
                  • Total Evidence: {stats.database?.total_evidence || 0}
                </Text>
              </View>
              
              {stats.recent_incidents && stats.recent_incidents.length > 0 && (
                <View style={tailwind('bg-amber-50 rounded p-2 mt-2 border border-amber-200')}>
                  <Text style={tailwind('text-amber-900 text-xs font-semibold mb-1')}>
                    ⚠️ Recent Incidents (Last 5):
                  </Text>
                  {stats.recent_incidents.map((inc, idx) => (
                    <Text key={idx} style={tailwind('text-amber-800 text-xs')}>
                      #{inc.incident_id}: Camera {inc.camera_id} ({inc.camera_owner_name || 'no owner'}) - {inc.evidence_count} evidence
                    </Text>
                  ))}
                  <Text style={tailwind('text-amber-700 text-xs mt-1 italic')}>
                    💡 You only see evidence from YOUR cameras
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {userRole && (
            <View style={tailwind('bg-sky-100 rounded-lg p-3 mb-4')}>
              <Text style={tailwind('text-sky-700 text-xs text-center')}>
                Logged in as: {userRole.toUpperCase()}
              </Text>
            </View>
          )}
          
          <TouchableOpacity 
            onPress={() => { setStats(null); onRefresh(); }}
            style={tailwind('bg-sky-600 rounded-lg px-4 py-2')}
          >
            <Text style={tailwind('text-white font-semibold')}>🔄 Refresh</Text>
          </TouchableOpacity>
          
          <Text style={tailwind('text-sky-500 text-xs text-center mt-4')}>
            Pull down to refresh
          </Text>
        </View>
      ) : (
        <FlatList
          data={evidence}
          keyExtractor={(item, index) => {
            try {
              if (!item || !item.id) {
                console.error('[FlatList] ❌ Item missing ID at index', index);
                return `evidence-fallback-${index}`;
              }
              return `evidence-${item.id}`;
            } catch (error) {
              console.error('[FlatList] ❌ Error in keyExtractor:', error);
              return `evidence-error-${index}`;
            }
          }}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0369a1']} />
          }
          onScrollBeginDrag={() => console.log('[FlatList] 📜 User started scrolling')}
          onEndReached={() => console.log('[FlatList] 📜 Reached end of list')}
          ListEmptyComponent={() => {
            console.log('[FlatList] ℹ️ List is empty, showing empty component');
            return (
              <View style={tailwind('flex-1 items-center justify-center p-8')}>
                <Ionicons name="alert-circle-outline" size={48} color="#94a3b8" />
                <Text style={tailwind('text-sky-600 text-center mt-4')}>
                  No evidence to display
                </Text>
                <View style={tailwind('mt-6 bg-blue-50 rounded-lg p-4 w-full')}>
                  <Text style={tailwind('text-blue-700 font-semibold text-center')}>Diagnostics</Text>
                  <Text style={tailwind('text-blue-600 text-xs mt-2')}>
                    • If incidents exist but evidence is empty, the AI worker may not be posting evidence.
                  </Text>
                  <Text style={tailwind('text-blue-600 text-xs')}>
                    • Evidence is stored under ai_worker/data/captures and served from /evidence/{cameraId/filename}.
                  </Text>
                  <TouchableOpacity
                    onPress={fetchStats}
                    style={tailwind('mt-3 bg-sky-600 rounded-lg px-4 py-2')}
                  >
                    <Text style={tailwind('text-white text-center font-semibold')}>🐛 Run Evidence Diagnostics</Text>
                  </TouchableOpacity>
                  {stats && (
                    <View style={tailwind('mt-3')}>
                      <Text style={tailwind('text-blue-700 text-xs')}>
                        Cameras Owned: {stats.user?.cameras_owned || 0} | Incidents: {stats.user?.incidents_from_cameras || 0} | Evidence: {stats.user?.evidence_from_cameras || 0}
                      </Text>
                      <Text style={tailwind('text-blue-700 text-xs')}>
                        DB Totals → Cameras: {stats.database?.total_cameras || 0}, Incidents: {stats.database?.total_incidents || 0}, Evidence: {stats.database?.total_evidence || 0}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
          onError={(error) => {
            console.error('[FlatList] ❌ FlatList error:', error);
          }}
        />
      )}
    </View>
  );
}

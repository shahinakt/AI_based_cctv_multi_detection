import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView
} from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureEvidence, verifySecureEvidence } from '../services/api_secure';
import { getDebugInfo } from '../services/api';

/**
 * ULTRA PROTECTION Evidence Storage Screen
 * ==========================================
 * 
 * Security Features:
 * - Role-based access control (RBAC)
 * - Blockchain verification status badges
 * - Tamper detection alerts
 * - Immutable evidence display
 * - Admin-only verify button
 * 
 * Role Permissions:
 * - ADMIN: View all, verify, see blockchain tx
 * - VIEWER: View own camera evidence only
 * - SECURITY: View shared evidence only (read-only)
 */
export default function EvidenceStoreSecure({ navigation }) {
  const tailwind = useTailwind();
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [verifying, setVerifying] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      // Check authentication first
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert(
          'Authentication Required',
          'Please log in to access the Evidence Store',
          [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }]
        );
        return;
      }

      const url = await initBaseUrl();
      await loadUserRole();
      await fetchEvidence();
    } catch (err) {
      console.error('[EvidenceStoreSecure] Initialization failed:', err);
    }
  };

  const initBaseUrl = async () => {
    const debugInfo = getDebugInfo();
    const url = debugInfo.BASE_URL || 'http://localhost:8000';
    setBaseUrl(url);
    return url;
  };

  const loadUserRole = async () => {
    try {
      // Get user data from AsyncStorage
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        setUserRole(user.role);
        console.log('[EvidenceStoreSecure] User role:', user.role);
      } else {
        console.warn('[EvidenceStoreSecure] No user data found in storage');
        setUserRole(null);
      }
    } catch (err) {
      console.error('[EvidenceStoreSecure] Failed to load user role:', err);
    }
  };

  const fetchEvidence = async () => {
    setLoading(true);
    try {
      const response = await getSecureEvidence();
      
      if (response && response.success) {
        setEvidence(response.data || []);
        console.log('[EvidenceStoreSecure] ✅ Loaded', response.data?.length || 0, 'evidence items');
      } else {
        console.error('[EvidenceStoreSecure] Failed:', response?.message);
        
        // Handle authentication errors
        if (response?.status === 401 || response?.message?.includes('authenticated')) {
          Alert.alert(
            'Authentication Required',
            'Your session has expired. Please log in again.',
            [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }]
          );
        } else {
          Alert.alert('Error', response?.message || 'Failed to load evidence');
        }
      }
    } catch (error) {
      console.error('[EvidenceStoreSecure] Error:', error);
      
      // Handle authentication errors from exception
      if (error.message?.includes('authenticated')) {
        Alert.alert(
          'Authentication Required',
          'Please log in to access the Evidence Store',
          [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }]
        );
      } else {
        Alert.alert('Error', error.message || 'Network error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchEvidence();
    setRefreshing(false);
  };

  const handleVerifyEvidence = async (evidenceItem) => {
    if (!evidenceItem.can_verify) {
      Alert.alert('Permission Denied', 'Only administrators can verify evidence');
      return;
    }

    Alert.alert(
      'Verify Evidence',
      'Verify this evidence against the blockchain record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify',
          onPress: async () => {
            setVerifying({ ...verifying, [evidenceItem.id]: true });
            try {
              const result = await verifySecureEvidence(evidenceItem.id);

              if (result && result.success) {
                const data = result.data;
                
                // Update local evidence status
                setEvidence(prevEvidence =>
                  prevEvidence.map(ev =>
                    ev.id === evidenceItem.id
                      ? { ...ev, tamper_status: data.status, verification_status: data.status }
                      : ev
                  )
                );

                // Show result
                if (data.status === 'VERIFIED') {
                  Alert.alert(
                    '✅ Verification Successful',
                    `${data.message}\n\nBlockchain Hash: ${data.blockchain_hash.substring(0, 16)}...`,
                    [{ text: 'OK' }]
                  );
                } else if (data.status === 'TAMPERED') {
                  Alert.alert(
                    '🚨 TAMPERING DETECTED',
                    `${data.message}\n\nExpected: ${data.blockchain_hash.substring(0, 16)}...\nActual: ${data.current_hash?.substring(0, 16)}...`,
                    [{ text: 'OK', style: 'destructive' }]
                  );
                } else if (data.status === 'FILE_MISSING') {
                  Alert.alert(
                    '⚠️ FILE MISSING',
                    data.message,
                    [{ text: 'OK', style: 'destructive' }]
                  );
                }
              } else {
                Alert.alert('Verification Failed', result?.message || 'Unknown error');
              }
            } catch (error) {
              console.error('[EvidenceStoreSecure] Verification error:', error);
              Alert.alert('Error', error.message || 'Failed to verify evidence');
            } finally {
              setVerifying({ ...verifying, [evidenceItem.id]: false });
            }
          }
        }
      ]
    );
  };

  const handleViewDetails = (item) => {
    setSelectedEvidence(item);
    setModalVisible(true);
  };

  const getTamperStatusBadge = (status) => {
    switch (status) {
      case 'VERIFIED':
        return {
          icon: 'shield-checkmark',
          color: '#10B981',
          bg: '#D1FAE5',
          label: 'VERIFIED',
          emoji: '🟢'
        };
      case 'TAMPERED':
        return {
          icon: 'warning',
          color: '#EF4444',
          bg: '#FEE2E2',
          label: 'TAMPERED',
          emoji: '🔴'
        };
      case 'FILE_MISSING':
        return {
          icon: 'alert-circle',
          color: '#F59E0B',
          bg: '#FEF3C7',
          label: 'FILE MISSING',
          emoji: '⚠️'
        };
      default:
        return {
          icon: 'time',
          color: '#F59E0B',
          bg: '#FEF3C7',
          label: 'PENDING',
          emoji: '🟡'
        };
    }
  };

  const renderEvidenceCard = ({ item }) => {
    const statusBadge = getTamperStatusBadge(item.tamper_status);
    const isTampered = item.tamper_status === 'TAMPERED' || item.tamper_status === 'FILE_MISSING';
    const imageUrl = `${baseUrl}/evidence/${item.file_path}`;

    return (
      <TouchableOpacity
        onPress={() => handleViewDetails(item)}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
          borderWidth: isTampered ? 3 : 0,
          borderColor: isTampered ? '#EF4444' : 'transparent'
        }}
      >
        {/* Tamper Warning Banner */}
        {isTampered && (
          <View style={{ backgroundColor: '#FEE2E2', padding: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
            <Text style={{ color: '#991B1B', fontWeight: 'bold', textAlign: 'center' }}>
              🚨 Evidence Integrity Compromised
            </Text>
          </View>
        )}

        {/* Evidence Header */}
        <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="document-lock" size={24} color="#3B82F6" />
            <View style={{ marginLeft: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937' }}>
                Evidence #{item.id}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>
                Incident #{item.incident_id}
              </Text>
            </View>
          </View>

          {/* Status Badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: statusBadge.bg,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 12
            }}
          >
            <Text style={{ fontSize: 16, marginRight: 4 }}>{statusBadge.emoji}</Text>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: statusBadge.color }}>
              {statusBadge.label}
            </Text>
          </View>
        </View>

        {/* Evidence Image */}
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height: 200, backgroundColor: '#F3F4F6' }}
          resizeMode="cover"
        />

        {/* Immutable Evidence Label */}
        <View style={{ padding: 16, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="lock-closed" size={16} color="#6B7280" />
            <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4, fontWeight: '600' }}>
              IMMUTABLE EVIDENCE
            </Text>
          </View>

          {/* Hash Preview */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="finger-print" size={16} color="#9CA3AF" />
            <Text style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 4, fontFamily: 'monospace' }}>
              SHA256: {item.sha256_hash ? item.sha256_hash.substring(0, 16) + '...' : 'N/A'}
            </Text>
          </View>

          {/* Blockchain Shield */}
          {item.blockchain_tx_hash && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="shield-checkmark" size={16} color="#3B82F6" />
              <Text style={{ fontSize: 10, color: '#3B82F6', marginLeft: 4 }}>
                Blockchain: {item.blockchain_tx_hash.substring(0, 16)}...
              </Text>
            </View>
          )}

          {/* Timestamp */}
          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
            Created: {new Date(item.created_at).toLocaleString()}
          </Text>

          {/* Verify Button (Admin Only) */}
          {item.can_verify && (
            <TouchableOpacity
              onPress={() => handleVerifyEvidence(item)}
              disabled={verifying[item.id]}
              style={{
                marginTop: 12,
                backgroundColor: verifying[item.id] ? '#9CA3AF' : '#3B82F6',
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {verifying[item.id] ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontWeight: 'bold', marginLeft: 8 }}>
                    Verify Evidence
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Access Info for Security Role */}
          {item.is_shared_with_me && (
            <View style={{ marginTop: 8, padding: 8, backgroundColor: '#DBEAFE', borderRadius: 6 }}>
              <Text style={{ fontSize: 11, color: '#1E40AF', fontWeight: '600' }}>
                📋 Shared with you by admin (Read-Only)
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    let message = 'No evidence found';
    let description = '';

    if (userRole === 'viewer') {
      description = 'Evidence from your cameras will appear here';
    } else if (userRole === 'security') {
      description = 'You can only view evidence shared with you by admin';
    } else if (userRole === 'admin') {
      description = 'All incident evidence will appear here';
    }

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 }}>
        <Ionicons name="folder-open-outline" size={64} color="#D1D5DB" />
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#6B7280', marginTop: 16 }}>
          {message}
        </Text>
        <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }}>
          {description}
        </Text>
      </View>
    );
  };

  if (loading && evidence.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{ marginTop: 16, color: '#6B7280' }}>Loading secure evidence...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Header */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: 50, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1F2937' }}>Evidence Storage</Text>
            <Text style={{ fontSize: 14, color: '#6B7280' }}>
              Incident evidence and files
            </Text>
          </View>
          <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
            <Text style={{ fontSize: 12, color: '#1E40AF', fontWeight: 'bold' }}>
              {userRole?.toUpperCase() || 'USER'}
            </Text>
          </View>
        </View>
      </View>

      {/* Evidence List */}
      <FlatList
        data={evidence}
        renderItem={renderEvidenceCard}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
      />

      {/* Detail Modal */}
      {selectedEvidence && (
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1F2937' }}>Evidence Details</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close-circle" size={30} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView>
                <Image
                  source={{ uri: `${baseUrl}/evidence/${selectedEvidence.file_path}` }}
                  style={{ width: '100%', height: 250, borderRadius: 12, marginBottom: 16 }}
                  resizeMode="contain"
                />

                <View style={{ padding: 16, backgroundColor: '#F9FAFB', borderRadius: 12 }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Evidence ID</Text>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>{selectedEvidence.id}</Text>

                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>SHA256 Hash</Text>
                  <Text style={{ fontSize: 10, fontFamily: 'monospace', color: '#374151', marginBottom: 12 }}>
                    {selectedEvidence.sha256_hash}
                  </Text>

                  {selectedEvidence.blockchain_tx_hash && (
                    <>
                      <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Blockchain TX</Text>
                      <Text style={{ fontSize: 10, fontFamily: 'monospace', color: '#374151', marginBottom: 12 }}>
                        {selectedEvidence.blockchain_tx_hash}
                      </Text>
                    </>
                  )}

                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Created</Text>
                  <Text style={{ fontSize: 14, color: '#374151' }}>
                    {new Date(selectedEvidence.created_at).toLocaleString()}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

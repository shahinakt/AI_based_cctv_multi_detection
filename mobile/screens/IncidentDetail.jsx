import React, { useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Alert, Modal, TouchableOpacity, Share, StatusBar, RefreshControl } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifyEvidence, getDebugInfo, getIncidents } from '../services/api';

const IncidentDetailScreen = ({ route, navigation }) => {
  const tailwind = useTailwind();
  const { incident: initialIncident } = route.params || {};
  const [incident, setIncident] = useState(initialIncident || {});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [verificationResults, setVerificationResults] = useState({});
  const [baseUrl, setBaseUrl] = useState('');
  
  // Debug: Log incident data on mount
  React.useEffect(() => {
    console.log('[IncidentDetail] 🔍 Incident ID:', initialIncident?.id);
    console.log('[IncidentDetail] 📎 Evidence items:', initialIncident?.evidence_items);
    console.log('[IncidentDetail] 📎 Evidence count:', initialIncident?.evidence_items?.length || 0);
    if (initialIncident?.evidence_items && initialIncident.evidence_items.length > 0) {
      console.log('[IncidentDetail] First evidence:', initialIncident.evidence_items[0]);
    }
  }, []);
  
  // Load user role and base URL on mount
  React.useEffect(() => {
    const loadUserRole = async () => {
      try {
        const role = await AsyncStorage.getItem('userRole');
        setUserRole(role);
      } catch (err) {
        console.error('Failed to load user role:', err);
      }
    };
    
    const initBaseUrl = async () => {
      const debugInfo = getDebugInfo();
      const url = debugInfo.BASE_URL || 'http://localhost:8000';
      setBaseUrl(url);
      console.log('[IncidentDetail] Using BASE_URL:', url);
    };
    
    loadUserRole();
    initBaseUrl();
  }, []);

  const handleAcknowledgeSuccess = async () => {
    setLoading(true);
    try {
      setIncident(prev => ({ ...prev, status: 'acknowledged', acknowledged: true }));
      Alert.alert('Updated', 'Incident marked acknowledged.');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not update incident.');
    } finally {
      setLoading(false);
    }
  };

  // Refresh incident data from API
  const handleRefresh = async () => {
    console.log('[IncidentDetail] 🔄 Refreshing incident data...');
    setRefreshing(true);
    try {
      const response = await getIncidents();
      if (response && response.success && response.data) {
        const freshIncident = response.data.find(inc => inc.id === incident.id);
        if (freshIncident) {
          console.log('[IncidentDetail] ✅ Fresh incident loaded:', freshIncident.id);
          console.log('[IncidentDetail] 📎 Fresh evidence count:', freshIncident.evidence_items?.length || 0);
          setIncident(freshIncident);
        } else {
          console.log('[IncidentDetail] ⚠️ Incident not found in fresh data');
        }
      } else {
        console.log('[IncidentDetail] ❌ Failed to refresh:', response?.message);
      }
    } catch (error) {
      console.error('[IncidentDetail] ❌ Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getAssignedUserName = () => {
    if (incident.assigned_user) {
      return incident.assigned_user.username;
    }
    return 'Unassigned';
  };

  const copyToClipboard = async (text) => {
    try {
      // Try multiple clipboard implementations (expo, community, react-native)
      let clipboard = null;
      try { clipboard = require('expo-clipboard'); } catch (e) {}
      try { if (!clipboard) clipboard = require('@react-native-clipboard/clipboard'); } catch (e) {}
      try { if (!clipboard) clipboard = require('react-native').Clipboard; } catch (e) {}

      if (clipboard) {
        if (clipboard.setStringAsync) await clipboard.setStringAsync(text);
        else if (clipboard.setString) clipboard.setString(text);
        else throw new Error('Clipboard method not found');
        Alert.alert('Copied', 'Transaction ID copied to clipboard');
      } else {
        // Fallback: open share dialog so user can copy from there
        await Share.share({ message: text });
        Alert.alert('Shared', 'Opened share dialog (no clipboard available).');
      }
    } catch (err) {
      console.warn('Clipboard write failed', err);
      Alert.alert('Error', 'Could not copy or share the transaction id.');
    }
  };
  
  const handleVerifyEvidence = async (evidenceItem) => {
    if (!evidenceItem.id) {
      Alert.alert('Error', 'Evidence ID not found');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await verifyEvidence(evidenceItem.id);
      
      if (result.success) {
        const { status, blockchain_hash, current_hash, message } = result.data;
        
        // Store verification result
        setVerificationResults(prev => ({
          ...prev,
          [evidenceItem.id]: {
            status,
            blockchain_hash,
            current_hash,
            verified_at: new Date().toISOString()
          }
        }));
        
        // Show result to user
        const icon = status === 'VERIFIED' ? '✔️' : '❌';
        const title = status === 'VERIFIED' ? 'Verified' : 'Tampered';
        
        Alert.alert(
          `${icon} ${title}`,
          message,
          [
            {
              text: 'View Details',
              onPress: () => {
                Alert.alert(
                  'Verification Details',
                  `Status: ${status}\n\nBlockchain Hash:\n${blockchain_hash}\n\nCurrent Hash:\n${current_hash}\n\nMatch: ${blockchain_hash === current_hash ? 'Yes' : 'No'}`
                );
              }
            },
            { text: 'OK' }
          ]
        );
      } else {
        Alert.alert('Verification Failed', result.message || 'Could not verify evidence');
      }
    } catch (err) {
      console.error('Verification error:', err);
      Alert.alert('Error', 'An error occurred during verification');
    } finally {
      setLoading(false);
    }
  };
  
  const canVerifyEvidence = () => {
    // Security role cannot verify
    if (userRole === 'security') return false;
    // Admin and viewer (user) roles can verify
    return userRole === 'admin' || userRole === 'viewer';
  };
  
  // Construct full evidence URL from file_path
  const getEvidenceUrl = (filePath) => {
    if (!filePath || !baseUrl) return null;
    // Evidence is served at /evidence/{file_path}
    // file_path format: "camera_0/snapshot_123.jpg" or similar
    return `${baseUrl}/evidence/${filePath}`;
  };

  const renderEvidence = (evidence = []) => {
    console.log('[IncidentDetail] renderEvidence called with:', evidence);
    console.log('[IncidentDetail] Evidence array length:', evidence?.length || 0);
    
    if (!evidence || evidence.length === 0) {
      console.log('[IncidentDetail] ⚠️ No evidence to display - showing empty state');
      return (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Ionicons name="image-outline" size={48} color="#D1D5DB" />
          <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8 }}>No evidence available</Text>
        </View>
      );
    }

    console.log('[IncidentDetail] ✅ Rendering', evidence.length, 'evidence items');
    return evidence.map((item, index) => {
      // Construct URL from file_path
      const url = getEvidenceUrl(item.file_path) || '';
      const isImage = url.match(/\.(jpeg|jpg|gif|png)$/i);
      const isVideo = url.match(/\.(mp4|mov|avi|mkv|m3u8)$/i);
      const isMjpeg = url.toLowerCase().includes('mjpeg') || url.toLowerCase().includes('mjpg');

      return (
        <View key={index} style={{ 
          marginBottom: 16, 
          backgroundColor: '#F9FAFB', 
          borderRadius: 8, 
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#E5E7EB'
        }}>
          <View style={{ 
            backgroundColor: '#EEF2FF', 
            paddingHorizontal: 12, 
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="document-attach" size={16} color="#4F46E5" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#4F46E5', marginLeft: 6 }}>
                Evidence {index + 1}
              </Text>
            </View>
            {isImage && url && (
              <TouchableOpacity onPress={() => { setActiveEvidence({ ...item, url }); setModalVisible(true); }}>
                <Ionicons name="expand" size={18} color="#4F46E5" />
              </TouchableOpacity>
            )}
          </View>

          <View style={{ padding: 8 }}>
            {isImage && url && (
              <TouchableOpacity onPress={() => { setActiveEvidence({ ...item, url }); setModalVisible(true); }}>
                <Image 
                  source={{ uri: url }} 
                  style={{ width: '100%', height: 220, borderRadius: 6 }} 
                  resizeMode="cover"
                  onError={(e) => console.log('[IncidentDetail] Image load error:', e.nativeEvent.error, 'URL:', url)} 
                />
              </TouchableOpacity>
            )}

            {isVideo && (
              <Video
                source={{ uri: url }}
                rate={1.0}
                volume={1.0}
                isMuted={false}
                resizeMode="contain"
                shouldPlay={false}
                isLooping={false}
                useNativeControls
                style={{ width: '100%', height: 220, borderRadius: 6 }}
                onError={(e) => console.log('Video load error:', e)}
              />
            )}

            {isMjpeg && (
              <View style={{ height: 220, borderRadius: 6, overflow: 'hidden' }}>
                <WebView source={{ uri: url }} style={{ flex: 1 }} />
              </View>
            )}

            {!isImage && !isVideo && !isMjpeg && (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Ionicons name="alert-circle" size={32} color="#F59E0B" />
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
                  {url ? 'Unsupported evidence type' : 'Evidence file not available'}
                </Text>
                {url ? (
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }} numberOfLines={1}>
                    {String(url)}
                  </Text>
                ) : null}
                {!url && item.file_path ? (
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }} numberOfLines={1}>
                    Path: {String(item.file_path)}
                  </Text>
                ) : null}
              </View>
            )}

            {(item.sha256_hash || item.blockchain_hash) && (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>
                  Hash: {(item.sha256_hash || item.blockchain_hash || '').slice(0, 16)}...
                </Text>
              </View>
            )}
            
            {/* Blockchain Verification Section */}
            {canVerifyEvidence() && item.blockchain_tx_hash && (
              <View style={{ 
                marginTop: 12, 
                paddingTop: 12, 
                borderTopWidth: 1, 
                borderTopColor: '#E5E7EB' 
              }}>
                {/* Blockchain TX Hash Display */}
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Blockchain TX:</Text>
                  <Text style={{ fontSize: 11, color: '#4F46E5', fontFamily: 'monospace' }} numberOfLines={1}>
                    {item.blockchain_tx_hash}
                  </Text>
                </View>
                
                {/* Verification Status Display - Show persistent backend status OR recent verification */}
                {((item.verification_status === 'VERIFIED' || item.verification_status === 'TAMPERED') || verificationResults[item.id]) && (() => {
                  // Prioritize recent verification result over backend status
                  const status = verificationResults[item.id]?.status || item.verification_status;
                  const verifiedAt = verificationResults[item.id]?.verified_at || item.verified_at;
                  const isVerified = status === 'VERIFIED';
                  
                  return (
                    <View style={{ 
                      marginBottom: 12, 
                      padding: 10, 
                      borderRadius: 6,
                      backgroundColor: isVerified ? '#D1FAE5' : '#FEE2E2',
                      borderWidth: 1,
                      borderColor: isVerified ? '#10B981' : '#EF4444'
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons 
                          name={isVerified ? 'checkmark-circle' : 'close-circle'} 
                          size={20} 
                          color={isVerified ? '#10B981' : '#EF4444'} 
                        />
                        <Text style={{ 
                          fontSize: 14, 
                          fontWeight: 'bold', 
                          color: isVerified ? '#047857' : '#DC2626',
                          marginLeft: 6
                        }}>
                          {isVerified ? '✔ Verified' : '❌ Tampered'}
                        </Text>
                      </View>
                      <Text style={{ 
                        fontSize: 11, 
                        color: isVerified ? '#065F46' : '#991B1B'
                      }}>
                        {isVerified 
                          ? 'Blockchain match confirmed' 
                          : 'Hash mismatch detected'}
                      </Text>
                      {verifiedAt && (
                        <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 4 }}>
                          Verified: {new Date(verifiedAt).toLocaleString()}
                        </Text>
                      )}
                    </View>
                  );
                })()}
                
                {/* Verify Evidence Button */}
                <TouchableOpacity 
                  onPress={() => handleVerifyEvidence(item)}
                  disabled={loading}
                  style={{ 
                    backgroundColor: loading ? '#9CA3AF' : '#4F46E5', 
                    paddingVertical: 10, 
                    paddingHorizontal: 16,
                    borderRadius: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
                  <Text style={{ 
                    fontSize: 14, 
                    fontWeight: '600', 
                    color: '#FFFFFF',
                    marginLeft: 8
                  }}>
                    {(verificationResults[item.id] || item.verification_status === 'VERIFIED' || item.verification_status === 'TAMPERED') 
                      ? 'Re-verify Evidence' 
                      : 'Verify Evidence'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Message for evidence without blockchain */}
            {canVerifyEvidence() && !item.blockchain_tx_hash && (
              <View style={{ 
                marginTop: 12, 
                paddingTop: 12, 
                borderTopWidth: 1, 
                borderTopColor: '#E5E7EB' 
              }}>
                <View style={{ 
                  padding: 10, 
                  borderRadius: 6,
                  backgroundColor: '#FEF3C7',
                  borderWidth: 1,
                  borderColor: '#F59E0B'
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="information-circle" size={18} color="#D97706" />
                    <Text style={{ 
                      fontSize: 12, 
                      color: '#92400E',
                      marginLeft: 6,
                      flex: 1
                    }}>
                      Evidence not registered on blockchain
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      );
    });
  };

  const getSeverityColor = (severity) => {
    const severityMap = {
      critical: '#DC2626',
      high: '#EF4444',
      medium: '#F59E0B',
      low: '#10B981'
    };
    return severityMap[severity] || '#6B7280';
  };

  const getStatusColor = (acknowledged) => {
    return acknowledged ? '#10B981' : '#EF4444';
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ padding: 16, paddingTop: 50 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
      >
        {/* Incident Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
          marginBottom: 20
        }}>
          {/* Incident ID Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ 
                backgroundColor: '#EEF2FF', 
                paddingHorizontal: 12, 
                paddingVertical: 6, 
                borderRadius: 8 
              }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#4F46E5' }}>
                  #{incident.id}
                </Text>
              </View>
            </View>
            
            {/* Status Badge */}
            <View style={{ 
              backgroundColor: getStatusColor(incident.acknowledged), 
              paddingHorizontal: 12, 
              paddingVertical: 6, 
              borderRadius: 8 
            }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' }}>
                {incident.acknowledged ? 'HANDLED' : 'PENDING'}
              </Text>
            </View>
          </View>

          {/* Severity Badge */}
          {incident.severity && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="warning" size={20} color={getSeverityColor(incident.severity)} />
              <View style={{ 
                backgroundColor: getSeverityColor(incident.severity), 
                paddingHorizontal: 10, 
                paddingVertical: 4, 
                borderRadius: 6,
                marginLeft: 8
              }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' }}>
                  {incident.severity?.toUpperCase()}
                </Text>
              </View>
            </View>
          )}

          {/* Details Grid */}
          <View style={{ gap: 12 }}>
            {/* Type */}
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Type</Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                  {incident.type || 'N/A'}
                </Text>
              </View>
            </View>

            {/* Camera Name */}
            {incident.camera?.name && (
              <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Camera</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="videocam" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                      {incident.camera.name}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Location */}
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Location</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="location" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                    {incident.camera?.location || incident.location || 'N/A'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Owner */}
            {incident.camera?.admin_user?.username && (
              <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Owner</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="person" size={16} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                      {incident.camera.admin_user.username}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Assigned To */}
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Assigned To</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person-circle" size={16} color="#6366F1" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                    {getAssignedUserName()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Timestamp */}
            <View style={{ flexDirection: 'row', paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Timestamp</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="time" size={16} color="#6B7280" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                    {incident.timestamp ? new Date(incident.timestamp).toLocaleString() : 'N/A'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Blockchain TX */}
          {incident.blockchain_tx && (
            <View style={{ 
              marginTop: 16, 
              padding: 12, 
              backgroundColor: '#F9FAFB', 
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#E5E7EB'
            }}>
              <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>Blockchain Transaction</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#1F2937', flex: 1 }} numberOfLines={1}>
                  {String(incident.blockchain_tx).slice(0, 20)}...
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity 
                    onPress={() => copyToClipboard(String(incident.blockchain_tx))} 
                    style={{ 
                      paddingHorizontal: 12, 
                      paddingVertical: 6, 
                      borderRadius: 6, 
                      backgroundColor: '#E5E7EB' 
                    }}
                  >
                    <Ionicons name="copy" size={16} color="#1F2937" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={async () => { 
                      try { 
                        await Share.share({ message: String(incident.blockchain_tx) }); 
                      } catch (e) {}
                    }} 
                    style={{ 
                      paddingHorizontal: 12, 
                      paddingVertical: 6, 
                      borderRadius: 6, 
                      backgroundColor: '#E5E7EB' 
                    }}
                  >
                    <Ionicons name="share-social" size={16} color="#1F2937" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Evidence Section - Visible for All Users */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
          marginBottom: 20
        }}>
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            marginBottom: 16,
            paddingBottom: 12,
            borderBottomWidth: 2,
            borderBottomColor: '#E5E7EB'
          }}>
            <Ionicons name="images" size={24} color="#4F46E5" />
            <Text style={{ 
              fontSize: 18, 
              fontWeight: 'bold', 
              color: '#1F2937',
              marginLeft: 8
            }}>
              Evidence ({incident.evidence_items?.length || 0})
            </Text>
          </View>
          {renderEvidence(incident.evidence_items)}
        </View>
      </ScrollView>

      {/* Loading Overlay */}
      {loading && (
        <View style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center' 
        }}>
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            padding: 24, 
            borderRadius: 12, 
            alignItems: 'center' 
          }}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={{ color: '#1F2937', marginTop: 12, fontSize: 14, fontWeight: '600' }}>
              Updating incident...
            </Text>
          </View>
        </View>
      )}

      {/* Evidence Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={() => setModalVisible(false)} 
            style={{ 
              position: 'absolute', 
              top: 50, 
              right: 20,
              backgroundColor: 'rgba(255,255,255,0.2)',
              padding: 12,
              borderRadius: 8
            }}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {activeEvidence && (
            <Image 
              source={{ uri: activeEvidence.url }} 
              style={{ width: '92%', height: '80%' }} 
              resizeMode="contain" 
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

export default IncidentDetailScreen;
import React, { useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Alert, Modal, TouchableOpacity, Share, StatusBar, RefreshControl } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifyEvidence, getDebugInfo, getIncidents, getBlockchainStatus, adminVerifyBlockchain, acknowledgeIncident, getSosStatus } from '../services/api';

const SOS_TIMEOUT = 60; // seconds — must match backend SOS_TIMEOUT_SECONDS

const isHighPriority = (severity) =>
  severity === 'high' || severity === 'critical';

const IncidentDetailScreen = ({ route, navigation }) => {
  const tailwind = useTailwind();
  const { incident: initialIncident, userRole: routeUserRole } = route.params || {};
  const [incident, setIncident] = useState(initialIncident || {});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState(null);
  // Seed role immediately from navigation param so it's available on first render.
  // AsyncStorage fallback handles cases where the param isn't provided.
  const [userRole, setUserRole] = useState(routeUserRole || null);
  const [verificationResults, setVerificationResults] = useState({});
  const [baseUrl, setBaseUrl] = useState('');
  const [blockchainRecord, setBlockchainRecord] = useState(null);
  const [blockchainLoading, setBlockchainLoading] = useState(false);
  const [bcVerifying, setBcVerifying] = useState(false);

  // SOS state
  const [sosStatus, setSosStatus] = useState(null);
  const [countdown, setCountdown] = useState(null);   // seconds remaining (null = not started)
  const [acknowledging, setAcknowledging] = useState(false);
  const countdownRef = React.useRef(null);

  // Debug: Log incident data on mount
  React.useEffect(() => {
    console.log('[IncidentDetail] 🔍 Incident ID:', initialIncident?.id);
    console.log('[IncidentDetail] 📎 Evidence items:', initialIncident?.evidence_items);
    console.log('[IncidentDetail] 📎 Evidence count:', initialIncident?.evidence_items?.length || 0);
    if (initialIncident?.evidence_items && initialIncident.evidence_items.length > 0) {
      console.log('[IncidentDetail] First evidence:', initialIncident.evidence_items[0]);
    }
  }, []);
  
  // Load user role and base URL on mount.
  // If routeUserRole was already provided by the navigation caller we skip the
  // AsyncStorage read (role is already in state), but we still need it if the
  // screen is opened from a context that doesn't pass the role param.
  React.useEffect(() => {
    const loadUserRole = async () => {
      try {
        // 1. If the calling screen passed the role param, trust it.
        if (routeUserRole) {
          console.log('[IncidentDetail] Role from route param:', routeUserRole);
          setUserRole(routeUserRole);
          return;
        }
        // 2. Try the 'user' object stored on login.
        const raw = await AsyncStorage.getItem('user');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.role) {
            console.log('[IncidentDetail] Role from AsyncStorage user object:', parsed.role);
            setUserRole(parsed.role);
            return;
          }
        }
        // 3. Presence of adminToken ⟹ admin session.
        const adminToken = await AsyncStorage.getItem('adminToken');
        if (adminToken) {
          console.log('[IncidentDetail] Role inferred from adminToken presence: admin');
          setUserRole('admin');
          return;
        }
        const securityToken = await AsyncStorage.getItem('securityToken');
        if (securityToken) {
          setUserRole('security');
          return;
        }
        setUserRole('viewer');
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

  // Load blockchain integrity status
  React.useEffect(() => {
    if (!initialIncident?.id) return;
    setBlockchainLoading(true);
    getBlockchainStatus(initialIncident.id)
      .then(result => {
        if (result.success) setBlockchainRecord(result.data);
      })
      .catch(() => {})
      .finally(() => setBlockchainLoading(false));
  }, [initialIncident?.id]);

  // -----------------------------------------------------------------------
  // SOS countdown timer
  // -----------------------------------------------------------------------
  React.useEffect(() => {
    const inc = initialIncident || {};
    if (!inc.id || inc.acknowledged || inc.sos_triggered) return;
    if (!isHighPriority(inc.severity)) return;

    // Calculate seconds elapsed since incident creation
    const createdAt = inc.timestamp ? new Date(inc.timestamp) : new Date();
    const elapsedMs = Date.now() - createdAt.getTime();
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const initialCountdown = Math.max(0, SOS_TIMEOUT - elapsedSec);

    if (initialCountdown <= 0) {
      // Timer already expired — fetch SOS status from server
      getSosStatus(inc.id).then(r => { if (r.success) setSosStatus(r.data); });
      return;
    }

    setCountdown(initialCountdown);

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current);
          // Fetch updated SOS status from backend
          getSosStatus(inc.id).then(r => { if (r.success) setSosStatus(r.data); });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownRef.current);
  }, [initialIncident?.id]);
  

  // -----------------------------------------------------------------------
  // Acknowledge incident – cancels SOS timer
  // -----------------------------------------------------------------------
  const handleAcknowledgeSuccess = async () => {
    if (acknowledging) return;
    const incId = incident.id || initialIncident?.id;
    if (!incId) return;

    Alert.alert(
      '✋ Acknowledge Incident',
      'Confirm that you have reviewed this incident. This will cancel any pending SOS alert.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Acknowledge',
          onPress: async () => {
            setAcknowledging(true);
            try {
              const result = await acknowledgeIncident(incId);
              if (result.success) {
                clearInterval(countdownRef.current);
                setCountdown(null);
                setIncident(prev => ({
                  ...prev,
                  acknowledged: true,
                  incident_status: 'Acknowledged',
                  acknowledged_at: result.data?.acknowledged_at,
                }));
                Alert.alert(
                  '✅ Acknowledged',
                  result.data?.sos_cancelled
                    ? 'Incident acknowledged. SOS alert has been cancelled.'
                    : 'Incident acknowledged successfully.',
                );
              } else {
                Alert.alert('Error', result.message || 'Could not acknowledge incident.');
              }
            } catch (err) {
              console.error('[IncidentDetail] Acknowledge error:', err);
              Alert.alert('Error', 'Network error. Please try again.');
            } finally {
              setAcknowledging(false);
            }
          },
        },
      ],
    );
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
    // Only Admin can trigger blockchain verification
    return userRole === 'admin';
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
            
            {/* Blockchain Evidence Status Section - Visible to all roles */}
            {item.blockchain_tx_hash && (
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

                {/* Verification Status Badge - shown to ALL roles */}
                {(() => {
                  const status = verificationResults[item.id]?.status || item.verification_status || 'Pending';
                  const verifiedAt = verificationResults[item.id]?.verified_at || item.verified_at;
                  const isVerified = status === 'VERIFIED';
                  const isTampered = status === 'TAMPERED';
                  const isPending = !isVerified && !isTampered;
                  const bgColor = isVerified ? '#D1FAE5' : isTampered ? '#FEE2E2' : '#FEF3C7';
                  const borderColor = isVerified ? '#10B981' : isTampered ? '#EF4444' : '#F59E0B';
                  const textColor = isVerified ? '#047857' : isTampered ? '#DC2626' : '#92400E';
                  const iconName = isVerified ? 'checkmark-circle' : isTampered ? 'close-circle' : 'time-outline';
                  const iconColor = isVerified ? '#10B981' : isTampered ? '#EF4444' : '#D97706';
                  const statusLabel = isVerified ? 'Verified' : isTampered ? 'Rejected' : 'Pending';
                  return (
                    <View style={{ marginBottom: 12, padding: 10, borderRadius: 6, backgroundColor: bgColor, borderWidth: 1, borderColor }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isPending ? 0 : 4 }}>
                        <Ionicons name={iconName} size={18} color={iconColor} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: textColor, marginLeft: 6 }}>
                          Blockchain Evidence Status: {statusLabel}
                        </Text>
                      </View>
                      {!isPending && (
                        <Text style={{ fontSize: 11, color: textColor }}>
                          {isVerified ? 'Blockchain match confirmed' : 'Hash mismatch detected'}
                        </Text>
                      )}
                      {verifiedAt && (
                        <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 4 }}>
                          Verified: {new Date(verifiedAt).toLocaleString()}
                        </Text>
                      )}
                    </View>
                  );
                })()}

                {/* Verify Evidence Button - Admin Only */}
                {userRole === 'admin' && (
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
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginLeft: 8 }}>
                      {(verificationResults[item.id] || item.verification_status === 'VERIFIED' || item.verification_status === 'TAMPERED')
                        ? 'Re-verify Evidence'
                        : 'Verify Evidence'}
                    </Text>
                  </TouchableOpacity>
                )}
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
        {/* ===================================================
            SOS URGENCY BANNER
            Shown when incident is high-priority and unacknowledged.
            =================================================== */}
        {isHighPriority(incident.severity || initialIncident?.severity) &&
          !(incident.acknowledged) && !incident.sos_triggered && (
          <View
            style={{
              backgroundColor: countdown !== null && countdown <= 10 ? '#7F1D1D' : '#991B1B',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              borderWidth: 2,
              borderColor: '#EF4444',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 24, marginRight: 8 }}>🚨</Text>
              <Text style={{ color: '#FEF2F2', fontWeight: '800', fontSize: 16, flex: 1 }}>
                High Priority Incident Detected
              </Text>
            </View>

            <Text style={{ color: '#FECACA', fontSize: 14, marginBottom: 12 }}>
              Please acknowledge within{' '}
              {countdown !== null ? (
                <Text style={{ fontWeight: '800', color: countdown <= 15 ? '#FCA5A5' : '#FECACA' }}>
                  {countdown}s
                </Text>
              ) : (
                <Text style={{ fontWeight: '800' }}>60 seconds</Text>
              )}
              {' '}— or an SOS alert will be automatically triggered.
            </Text>

            {/* Countdown progress bar */}
            {countdown !== null && (
              <View style={{ backgroundColor: '#7F1D1D', borderRadius: 4, height: 6, marginBottom: 12 }}>
                <View
                  style={{
                    backgroundColor: countdown <= 15 ? '#EF4444' : '#F97316',
                    borderRadius: 4,
                    height: 6,
                    width: `${Math.min(100, (countdown / SOS_TIMEOUT) * 100)}%`,
                  }}
                />
              </View>
            )}

            <TouchableOpacity
              style={{
                backgroundColor: acknowledging ? '#374151' : '#EF4444',
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
              }}
              onPress={handleAcknowledgeSuccess}
              disabled={acknowledging}
            >
              {acknowledging ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
              )}
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {acknowledging ? 'Acknowledging…' : 'Acknowledge Incident'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SOS Triggered banner (read-only) */}
        {(incident.sos_triggered ||
          sosStatus?.sos_triggered ||
          incident.incident_status === 'SosTriggered') && (
          <View
            style={{
              backgroundColor: '#450A0A',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              borderWidth: 2,
              borderColor: '#DC2626',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, marginRight: 8 }}>🚨</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FEF2F2', fontWeight: '800', fontSize: 15 }}>
                  SOS Alert Triggered
                </Text>
                <Text style={{ color: '#FECACA', fontSize: 13, marginTop: 4 }}>
                  This incident was not acknowledged in time. Admins have been notified.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Acknowledged banner */}
        {incident.acknowledged && !incident.sos_triggered && (
          <View
            style={{
              backgroundColor: '#052E16',
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#16A34A',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Ionicons name="checkmark-circle" size={22} color="#16A34A" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#D1FAE5', fontWeight: '700', fontSize: 14 }}>
                Incident Acknowledged
              </Text>
              {incident.acknowledged_at && (
                <Text style={{ color: '#6EE7B7', fontSize: 12, marginTop: 2 }}>
                  {new Date(incident.acknowledged_at).toLocaleString()}
                </Text>
              )}
            </View>
          </View>
        )}

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

        {/* ─── Blockchain Evidence Integrity Panel ─── */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 3,
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#6366F1" />
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginLeft: 8 }}>
              Blockchain Evidence Integrity
            </Text>
          </View>

          {blockchainLoading ? (
            <ActivityIndicator size="small" color="#6366F1" />
          ) : blockchainRecord ? (() => {
            const s = blockchainRecord.verification_status;
            const color  = s === 'Verified' ? '#10B981' : s === 'Rejected' ? '#EF4444' : '#F59E0B';
            const icon   = s === 'Verified' ? 'checkmark-circle' : s === 'Rejected' ? 'close-circle' : 'time-outline';
            const emoji  = s === 'Verified' ? '🟢' : s === 'Rejected' ? '🔴' : '🟡';
            return (
              <View>
                {/* Status Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 18, marginRight: 8 }}>{emoji}</Text>
                  <Ionicons name={icon} size={20} color={color} style={{ marginRight: 6 }} />
                  <Text style={{ color, fontWeight: '700', fontSize: 15 }}>
                    {s === 'Pending' ? 'Pending Verification' : s === 'Verified' ? 'Verified' : 'Rejected'}
                  </Text>
                </View>

                {/* Details */}
                <View style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>Incident ID</Text>
                    <Text style={{ color: '#1F2937', fontSize: 12, fontWeight: '600' }}>#{blockchainRecord.incident_id}</Text>
                  </View>
                  {blockchainRecord.verified_by_admin && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: '#6B7280', fontSize: 12 }}>Blockchain Status</Text>
                      <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Verified by Admin</Text>
                    </View>
                  )}
                  {blockchainRecord.verification_date && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: '#6B7280', fontSize: 12 }}>Verified On</Text>
                      <Text style={{ color: '#1F2937', fontSize: 12 }}>
                        {new Date(blockchainRecord.verification_date).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>Evidence Hash</Text>
                    <Text style={{ color: '#6366F1', fontSize: 11, fontFamily: 'monospace' }}>
                      {blockchainRecord.evidence_hash
                        ? `${blockchainRecord.evidence_hash.slice(0, 10)}…${blockchainRecord.evidence_hash.slice(-6)}`
                        : 'N/A'}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons Row */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  {/* Verify Evidence — admin only, pending only */}
                  {userRole === 'admin' && s === 'Pending' && (
                    <TouchableOpacity
                      onPress={async () => {
                        setBcVerifying(true);
                        const res = await adminVerifyBlockchain(blockchainRecord.incident_id);
                        setBcVerifying(false);
                        if (res.success) {
                          setBlockchainRecord(prev => ({ ...prev, verification_status: res.data?.status || 'Verified', verified_by_admin: true, verification_date: new Date().toISOString() }));
                          Alert.alert('✅ Verified', 'Evidence integrity confirmed on blockchain.');
                        } else {
                          Alert.alert('Error', res.message || 'Verification failed.');
                        }
                      }}
                      disabled={bcVerifying}
                      style={{
                        flex: 1,
                        backgroundColor: bcVerifying ? '#C7D2FE' : '#6366F1',
                        borderRadius: 10,
                        paddingVertical: 12,
                        flexDirection: 'row',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                      activeOpacity={0.8}
                    >
                      {bcVerifying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-shield-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Verify Evidence</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* View Blockchain Details */}
                  <TouchableOpacity
                    onPress={() => navigation.navigate('BlockchainVerification', { incident })}
                    style={{
                      flex: 1,
                      backgroundColor: '#F9FAFB',
                      borderRadius: 10,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="open-outline" size={16} color="#6366F1" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#6366F1', fontWeight: '700', fontSize: 14 }}>View Details</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })() : (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Ionicons name="cloud-offline-outline" size={36} color="#D1D5DB" />
              <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                No blockchain record yet.{' '}
                {userRole === 'admin' ? 'Records appear once evidence is generated.' : ''}
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('BlockchainVerification', { incident })}
                style={{ marginTop: 10 }}
              >
                <Text style={{ color: '#6366F1', fontSize: 13, fontWeight: '600' }}>View Details →</Text>
              </TouchableOpacity>
            </View>
          )}
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
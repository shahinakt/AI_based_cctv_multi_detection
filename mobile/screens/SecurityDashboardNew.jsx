// screens/SecurityDashboardNew.jsx - Simplified with 3 separate tabs
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, ScrollView, BackHandler, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getIncidents, acknowledgeIncident, listSosAlerts, handleSosAlert, getMe, updateUser } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper function to map incident type to display name
const getIncidentTypeLabel = (type) => {
  const typeLabels = {
    'abuse_violence': 'Abuse/Violence',
    'theft': 'Theft',
    'fall_health': 'Fall/Health Issue',
    'accident_car_theft': 'Other'
  };
  return typeLabels[type] || type?.replace('_', ' ');
};

const SecurityDashboardNew = ({ navigation }) => {
  // Tab state - 4 tabs: reports, sos, assigned, profile
  const [currentTab, setCurrentTab] = useState('reports');
  
  // Incidents state
  const [incidents, setIncidents] = useState([]);
  const [sosAlerts, setSOSAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const acknowledgedIncidentsRef = useRef(new Set());

  // SOS Mark Handled modal state
  const [sosActionModal, setSosActionModal] = useState({ visible: false, sosId: null });
  const [sosResolveNote, setSosResolveNote] = useState('');
  const [sosHandling, setSosHandling] = useState(false);

  // Profile state
  const [userProfile, setUserProfile] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhoneError, setEditPhoneError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Fetch all data
  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [incidentsResponse, sosResponse, profileResponse] = await Promise.all([
        getIncidents(),
        listSosAlerts({ alertStatus: undefined }), // fetch all SOS alerts from sos_alerts table
        getMe('security')
      ]);
      
      if (profileResponse.success) {
        setUserProfile(profileResponse.data);
        await AsyncStorage.setItem('securityUser', JSON.stringify(profileResponse.data));
      }
      
      if (incidentsResponse.success) {
        // Filter incidents: only viewer reports OR incidents assigned to current security user
        const currentUserId = profileResponse.data?.id;
        const filteredIncidents = incidentsResponse.data.filter(inc => {
          // Include viewer reports
          const isViewerReport = inc.description?.startsWith('[VIEWER REPORT]');
          // Include incidents assigned to this security user
          const isAssignedToMe = currentUserId && inc.assigned_user_id === currentUserId;
          
          return isViewerReport || isAssignedToMe;
        });
        
        const processedIncidents = filteredIncidents.map(inc => {
          let enhanced = { ...inc };
          if (acknowledgedIncidentsRef.current.has(inc.id)) {
            enhanced.acknowledged = true;
            enhanced.status = 'acknowledged';
          }
          if (inc.acknowledged || inc.status === 'acknowledged') {
            acknowledgedIncidentsRef.current.add(inc.id);
          }
          return enhanced;
        });
        setIncidents(processedIncidents);
      }
      
      // sosResponse.data contains SosAlert objects (from /api/v1/sos/)
      // Fields: id, incident_id, alert_status ('active'|'handled'), triggered_at,
      //         handled_at, handled_by_admin, alert_message
      if (sosResponse.success) {
        setSOSAlerts(sosResponse.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(false);
    const interval = setInterval(() => fetchData(true), 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backHandler.remove();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData(false);
    setRefreshing(false);
  };

  const handleAcknowledge = async (incidentId, isSOS = false) => {
    try {
      setActionLoading(prev => ({ ...prev, [incidentId]: true }));
      
      const updateFunc = (prev) => prev.map(inc => 
        inc.id === incidentId 
          ? { ...inc, acknowledged: true, status: 'acknowledged', assigned_user_id: userProfile?.id, assigned_user: userProfile } 
          : inc
      );
      
      if (isSOS) setSOSAlerts(updateFunc);
      else setIncidents(updateFunc);
      
      acknowledgedIncidentsRef.current.add(incidentId);
      
      const res = await acknowledgeIncident(incidentId);
      
      if (res.success) {
        Alert.alert('Success', 'Incident handled by security! Admin and reporter have been notified.', [{ text: 'OK' }]);
      } else {
        const revertFunc = (prev) => prev.map(inc => 
          inc.id === incidentId 
            ? { ...inc, acknowledged: false, status: 'pending', assigned_user_id: null, assigned_user: null } 
            : inc
        );
        if (isSOS) setSOSAlerts(revertFunc);
        else setIncidents(revertFunc);
        acknowledgedIncidentsRef.current.delete(incidentId);
        Alert.alert('Error', res.message || 'Failed to handle incident');
      }
    } catch (e) {
      console.error('Acknowledge error:', e);
      Alert.alert('Error', 'Failed to handle incident');
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const handleMarkSosHandled = async () => {
    const { sosId } = sosActionModal;
    if (!sosId) return;
    setSosHandling(true);
    const res = await handleSosAlert(sosId, sosResolveNote.trim());
    setSosHandling(false);
    setSosActionModal({ visible: false, sosId: null });
    setSosResolveNote('');
    if (res.success) {
      setSOSAlerts(prev =>
        prev.map(a =>
          a.id === sosId
            ? { ...a, alert_status: 'handled', handled_at: new Date().toISOString() }
            : a,
        ),
      );
      Alert.alert('✅ Resolved', 'SOS alert has been marked as handled.');
    } else {
      Alert.alert('Error', res.message || 'Failed to handle SOS alert');
    }
  };

  const handleEditPhoneChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setEditPhone(digits);
    setEditPhoneError(digits.length > 0 && digits.length < 10 ? 'Phone number must contain exactly 10 digits.' : '');
  };

  // Handle profile update
  const handleSaveProfile = async () => {
    if (editPhone && editPhone.trim() && !/^[0-9]{10}$/.test(editPhone.trim())) {
      setEditPhoneError('Phone number must contain exactly 10 digits.');
      return;
    }
    try {
      setSaveLoading(true);
      
      // Only send username and phone (email cannot be changed)
      const updateData = {
        username: editUsername.trim()
      };
      if (editPhone && editPhone.trim()) {
        updateData.phone = editPhone.trim();
      }
      
      console.log('[SecurityDashboard] Updating profile with:', updateData);
      const res = await updateUser(userProfile.id, updateData);
      console.log('[SecurityDashboard] Update response:', res);
      
      if (res.success) {
        console.log('[SecurityDashboard] Profile updated successfully, new data:', res.data);
        
        // Create updated profile object ensuring all fields are present
        const updatedProfile = {
          ...userProfile,
          ...res.data,
          username: res.data.username || updateData.username,
          phone: res.data.phone || updateData.phone || userProfile.phone
        };
        
        console.log('[SecurityDashboard] Setting userProfile to:', updatedProfile);
        
        // Update local state - use callback to ensure it updates
        setUserProfile(prevProfile => {
          console.log('[SecurityDashboard] Previous profile:', prevProfile);
          console.log('[SecurityDashboard] New profile:', updatedProfile);
          return updatedProfile;
        });
        
        // Update AsyncStorage for both security-specific and general user keys
        await AsyncStorage.setItem('securityUser', JSON.stringify(updatedProfile));
        await AsyncStorage.setItem('user', JSON.stringify(updatedProfile));
        
        // Close modal first
        setEditModalVisible(false);
        
        // Show success alert
        Alert.alert('Success', 'Profile updated successfully!');
      } else {
        Alert.alert('Error', res.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Update profile error:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaveLoading(false);
    }
  };

  // Open edit modal
  const openEditModal = () => {
    setEditUsername(userProfile?.username || '');
    setEditEmail(userProfile?.email || '');
    setEditPhone(userProfile?.phone || '');
    setEditPhoneError('');
    setEditModalVisible(true);
  };

  // Generic incident card renderer
  const renderIncidentCard = (item, categoryLabel, categoryColor, isSOS = false) => {
    const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;
    const severity = item.severity || 'medium';
    const severityColors = {
      critical: '#DC2626',
      high: '#EF4444',
      medium: '#F59E0B',
      low: '#10B981'
    };
    
    // Extract reporter info
    let reporter = 'Security';
    if (item.description?.startsWith('[VIEWER REPORT]')) {
      const contactMatch = item.description.match(/Contact:\s*(\d+)/);
      reporter = contactMatch ? `Viewer (${contactMatch[1]})` : 'Viewer';
    } else if (item.description?.startsWith('[SOS ALERT]')) {
      const userMatch = item.description?.match(/User:\s*([^\n]+)/);
      reporter = userMatch ? userMatch[1].trim() : 'SOS User';
    }

    return (
      <View style={{ backgroundColor: '#FFFFFF', padding: 16, marginBottom: 12, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2, borderLeftWidth: 4, borderLeftColor: categoryColor }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
          activeOpacity={0.7}
        >
          <View style={{ backgroundColor: categoryColor + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, alignSelf: 'flex-start', marginBottom: 12 }}>
            <Text style={{ color: categoryColor, fontSize: 11, fontWeight: '700' }}>{categoryLabel}</Text>
          </View>
          
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 6 }}>Incident #{item.id}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Ionicons name="alert-circle-outline" size={16} color="#6B7280" />
            <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 6 }}>{getIncidentTypeLabel(item.type)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Ionicons name="person-outline" size={16} color="#6B7280" />
            <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 6 }}>{reporter}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="time-outline" size={16} color="#9CA3AF" />
            <Text style={{ fontSize: 13, color: '#9CA3AF', marginLeft: 6 }}>
              {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: severityColors[severity] || severityColors.medium }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{severity.toUpperCase()}</Text>
          </View>
          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: acknowledged ? '#10B981' : '#EF4444' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
              {acknowledged ? 'HANDLED' : 'PENDING'}
            </Text>
          </View>
        </View>

          {item.description && (
            <View style={{ padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: categoryColor }}>
              <Text style={{ fontSize: 13, color: '#1F2937', lineHeight: 20 }}>{item.description}</Text>
            </View>
          )}
        </TouchableOpacity>

        {acknowledged && item.assigned_user && (
          <View style={{ padding: 10, backgroundColor: '#F0FDF4', borderRadius: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 13, color: '#065F46', flex: 1 }}>
              Handled by {item.assigned_user.role === 'security' ? 'Security' : 'Admin'}: {item.assigned_user.username}
            </Text>
          </View>
        )}

        {!acknowledged && (
          <TouchableOpacity 
            style={{ backgroundColor: '#4F46E5', padding: 14, borderRadius: 8, alignItems: 'center' }}
            onPress={() => handleAcknowledge(item.id, isSOS)}
            disabled={actionLoading[item.id]}
          >
            {actionLoading[item.id] ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>Handle Incident</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render Reports Tab
  const renderReportsTab = () => {
    const viewerReports = incidents.filter(i => i.description?.startsWith('[VIEWER REPORT]'));
    const unhandledCount = viewerReports.filter(i => !(i.status === 'acknowledged' || i.acknowledged === true)).length;

    return (
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7C3AED']} />}
      >
        <View style={{ padding: 16 }}>
          {loading ? (
            <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 32 }} />
          ) : viewerReports.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', padding: 32, borderRadius: 12, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" />
              <Text style={{ color: '#1F2937', fontSize: 20, fontWeight: '600', marginTop: 16 }}>No viewer reports</Text>
              <Text style={{ color: '#6B7280', fontSize: 15, marginTop: 8 }}>All clear</Text>
            </View>
          ) : (
            <>
              {unhandledCount > 0 && (
                <View style={{ padding: 16, borderRadius: 10, marginBottom: 16, backgroundColor: '#EDE9FE', flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="document-text" size={24} color="#7C3AED" style={{ marginRight: 12 }} />
                  <Text style={{ color: '#5B21B6', fontSize: 15, fontWeight: '600', flex: 1 }}>
                    {unhandledCount} report{unhandledCount !== 1 ? 's' : ''} need{unhandledCount === 1 ? 's' : ''} attention
                  </Text>
                </View>
              )}
              
              <FlatList
                data={viewerReports}
                renderItem={({ item }) => renderIncidentCard(item, '👁️ VIEWER REPORT', '#7C3AED', false)}
                keyExtractor={(item) => `report-${item.id}`}
                scrollEnabled={false}
              />
            </>
          )}
        </View>
      </ScrollView>
    );
  };

  // Render a single SosAlert card (SosAlert objects from /api/v1/sos/)
  const renderSosAlertCard = (alert) => {
    const isActive = alert.alert_status === 'active';
    const triggeredAt = alert.triggered_at
      ? new Date(alert.triggered_at).toLocaleString()
      : '—';
    const handledAt = alert.handled_at
      ? new Date(alert.handled_at).toLocaleString()
      : null;

    return (
      <View
        key={`sos-alert-${alert.id}`}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          borderLeftWidth: 4,
          borderLeftColor: isActive ? '#EF4444' : '#10B981',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ color: '#1F2937', fontWeight: '800', fontSize: 16 }}>
              🚨 SOS Alert #{alert.id}
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
              Incident #{alert.incident_id}
            </Text>
          </View>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: isActive ? '#FEF2F2' : '#ECFDF5',
            borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
            borderWidth: 1, borderColor: isActive ? '#FCA5A5' : '#6EE7B7',
          }}>
            <Ionicons
              name={isActive ? 'warning' : 'checkmark-circle'}
              size={13}
              color={isActive ? '#DC2626' : '#059669'}
              style={{ marginRight: 4 }}
            />
            <Text style={{ color: isActive ? '#DC2626' : '#059669', fontWeight: '700', fontSize: 12 }}>
              {isActive ? 'Active' : 'Handled'}
            </Text>
          </View>
        </View>

        {/* Message */}
        {alert.alert_message ? (
          <Text style={{ color: '#374151', fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
            {alert.alert_message}
          </Text>
        ) : null}

        {/* Timestamps */}
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
            🕐 Triggered: <Text style={{ color: '#6B7280' }}>{triggeredAt}</Text>
          </Text>
          {handledAt ? (
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>
              ✅ Handled: <Text style={{ color: '#6B7280' }}>{handledAt}</Text>
            </Text>
          ) : null}
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
            onPress={() => navigation.navigate('IncidentDetail', { incident: { id: alert.incident_id } })}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#4F46E5', fontWeight: '600', fontSize: 13 }}>View Incident</Text>
          </TouchableOpacity>

          {isActive && (
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
              onPress={() => {
                setSosResolveNote('');
                setSosActionModal({ visible: true, sosId: alert.id });
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Mark Handled</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Render SOS Alerts Tab
  const renderSOSAlertsTab = () => {
    const activeCount = sosAlerts.filter(a => a.alert_status === 'active').length;

    return (
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#DC2626']} />}>
        <View style={{ padding: 16 }}>
          {loading ? (
            <ActivityIndicator size="large" color="#DC2626" style={{ marginTop: 32 }} />
          ) : sosAlerts.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', padding: 32, borderRadius: 12, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" />
              <Text style={{ color: '#1F2937', fontSize: 20, fontWeight: '600', marginTop: 16 }}>No SOS alerts</Text>
              <Text style={{ color: '#6B7280', fontSize: 15, marginTop: 8 }}>All clear</Text>
            </View>
          ) : (
            <>
              {activeCount > 0 && (
                <View style={{ padding: 16, borderRadius: 10, marginBottom: 16, backgroundColor: '#FEE2E2', flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="alert-circle" size={24} color="#DC2626" style={{ marginRight: 12 }} />
                  <Text style={{ color: '#991B1B', fontSize: 15, fontWeight: '600', flex: 1 }}>
                    {activeCount} SOS alert{activeCount !== 1 ? 's' : ''} active
                  </Text>
                </View>
              )}
              {sosAlerts.map(item => renderSosAlertCard(item))}
            </>
          )}
        </View>
      </ScrollView>
    );
  };

  // Render Assigned Incidents Tab
  const renderAssignedTab = () => {
    const assignedIncidents = incidents.filter(i => userProfile?.id && i.assigned_user_id === userProfile.id);
    const unhandledCount = assignedIncidents.filter(i => !i.acknowledged && i.status !== 'acknowledged').length;

    return (
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}>
        <View style={{ padding: 16 }}>
          {loading ? (
            <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 32 }} />
          ) : assignedIncidents.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', padding: 32, borderRadius: 12, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" />
              <Text style={{ color: '#1F2937', fontSize: 20, fontWeight: '600', marginTop: 16 }}>No assigned incidents</Text>
            </View>
          ) : (
            <>
              {unhandledCount > 0 && (
                <View style={{ padding: 16, borderRadius: 10, marginBottom: 16, backgroundColor: '#DBEAFE', flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person-circle" size={24} color="#2563EB" style={{ marginRight: 12 }} />
                  <Text style={{ color: '#1E40AF', fontSize: 15, fontWeight: '600', flex: 1 }}>
                    {unhandledCount} incident{unhandledCount !== 1 ? 's' : ''} assigned to you
                  </Text>
                </View>
              )}
              <FlatList
                data={assignedIncidents}
                renderItem={({ item }) => renderIncidentCard(item, '👤 ASSIGNED TO YOU', '#2563EB', false)}
                keyExtractor={(item) => `assigned-${item.id}`}
                scrollEnabled={false}
              />
            </>
          )}
        </View>
      </ScrollView>
    );
  };

  // Render Profile Tab
  const renderProfileTab = () => {
    return (
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />}>
        <View style={{ padding: 16 }}>
          <View style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#1F2937' }}>Profile</Text>
              <TouchableOpacity
                onPress={openEditModal}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#4F46E5' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Edit</Text>
              </TouchableOpacity>
            </View>
            
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6 }}>Full Name</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="person-outline" size={20} color="#4F46E5" style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 16, color: '#1F2937' }}>{userProfile?.username || 'Not set'}</Text>
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6 }}>Email Address</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="mail-outline" size={20} color="#4F46E5" style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 16, color: '#1F2937' }}>{userProfile?.email || 'Not set'}</Text>
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6 }}>Phone Number</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="call-outline" size={20} color="#4F46E5" style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 16, color: '#1F2937' }}>{userProfile?.phone || 'Not set'}</Text>
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6 }}>User ID</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="finger-print-outline" size={20} color="#4F46E5" style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 16, color: '#1F2937' }}>#{userProfile?.id || 'N/A'}</Text>
              </View>
            </View>
          </View>

          <View style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, marginBottom: 16 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}
              onPress={async () => {
                try {
                  await AsyncStorage.multiRemove(['securityToken', 'securityUser', 'userToken', 'user', 'token']);
                  navigation.replace('SecurityLogin');
                } catch (error) {
                  console.error('Logout error:', error);
                  Alert.alert('Error', 'Failed to logout. Please try again.');
                }
              }}
            >
              <Ionicons name="log-out-outline" size={22} color="#DC2626" style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, color: '#DC2626', fontWeight: '600' }}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  };

  // Calculate counts
  const reportsCount = useMemo(() => incidents.filter(i => i.description?.startsWith('[VIEWER REPORT]') && !i.acknowledged && i.status !== 'acknowledged').length, [incidents]);
  const sosCount = useMemo(() => sosAlerts.filter(a => a.alert_status === 'active').length, [sosAlerts]);
  const assignedCount = useMemo(() => incidents.filter(i => userProfile?.id && i.assigned_user_id === userProfile.id && !i.acknowledged && i.status !== 'acknowledged').length, [incidents, userProfile]);
  const totalPending = reportsCount + sosCount + assignedCount;

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      {/* Header */}
      <View style={{ backgroundColor: '#4F46E5', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginBottom: 4 }}>Security Dashboard</Text>
        <Text style={{ color: '#C7D2FE', fontSize: 15 }}>
          {totalPending} pending incident{totalPending !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Tab Content */}
      {currentTab === 'reports' && renderReportsTab()}
      {currentTab === 'sos' && renderSOSAlertsTab()}
      {currentTab === 'assigned' && renderAssignedTab()}
      {currentTab === 'profile' && renderProfileTab()}

      {/* SOS Mark Handled Confirmation Modal */}
      <Modal
        visible={sosActionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSosActionModal({ visible: false, sosId: null })}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 6 }}>
              🚨 Resolve SOS Alert #{sosActionModal.sosId}
            </Text>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              Add a resolution note (optional):
            </Text>
            <TextInput
              value={sosResolveNote}
              onChangeText={setSosResolveNote}
              placeholder="e.g. False alarm, situation resolved..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              style={{
                borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
                padding: 12, fontSize: 14, color: '#1F2937',
                backgroundColor: '#F9FAFB', minHeight: 70,
                textAlignVertical: 'top', marginBottom: 20,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setSosActionModal({ visible: false, sosId: null })}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center' }}
                disabled={sosHandling}
              >
                <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleMarkSosHandled}
                disabled={sosHandling}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: sosHandling ? '#E5E7EB' : '#DC2626', alignItems: 'center' }}
              >
                {sosHandling
                  ? <ActivityIndicator size="small" color="#DC2626" />
                  : <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Mark Handled</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#1F2937' }}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Full Name</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 16, color: '#1F2937' }}
                value={editUsername}
                onChangeText={setEditUsername}
                placeholder="Enter your name"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Email Address</Text>
              <View style={{ borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, color: '#9CA3AF', flex: 1 }}>{editEmail}</Text>
                <Ionicons name="lock-closed" size={16} color="#9CA3AF" />
              </View>
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>Email cannot be changed</Text>
            </View>

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Phone Number</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: editPhoneError ? '#EF4444' : '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 16, color: '#1F2937' }}
                value={editPhone}
                onChangeText={handleEditPhoneChange}
                placeholder="10-digit phone number"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={10}
              />
              {editPhoneError ? (
                <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{editPhoneError}</Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center' }}
                onPress={() => setEditModalVisible(false)}
                disabled={saveLoading}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#6B7280' }}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#4F46E5', alignItems: 'center' }}
                onPress={handleSaveProfile}
                disabled={saveLoading}
              >
                {saveLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingBottom: 10, paddingTop: 8, flexDirection: 'row' }}>
        <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }} onPress={() => setCurrentTab('reports')}>
          <View style={{ position: 'relative' }}>
            <Ionicons name={currentTab === 'reports' ? 'document-text' : 'document-text-outline'} size={24} color={currentTab === 'reports' ? '#7C3AED' : '#9CA3AF'} />
            {reportsCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: '#7C3AED', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{reportsCount > 9 ? '9+' : reportsCount}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, marginTop: 4, color: currentTab === 'reports' ? '#7C3AED' : '#6B7280', fontWeight: currentTab === 'reports' ? '600' : '400' }}>Reports</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }} onPress={() => setCurrentTab('sos')}>
          <View style={{ position: 'relative' }}>
            <Ionicons name={currentTab === 'sos' ? 'alert-circle' : 'alert-circle-outline'} size={24} color={currentTab === 'sos' ? '#DC2626' : '#9CA3AF'} />
            {sosCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: '#DC2626', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{sosCount > 9 ? '9+' : sosCount}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, marginTop: 4, color: currentTab === 'sos' ? '#DC2626' : '#6B7280', fontWeight: currentTab === 'sos' ? '600' : '400' }}>SOS</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }} onPress={() => setCurrentTab('assigned')}>
          <View style={{ position: 'relative' }}>
            <Ionicons name={currentTab === 'assigned' ? 'person-circle' : 'person-circle-outline'} size={24} color={currentTab === 'assigned' ? '#2563EB' : '#9CA3AF'} />
            {assignedCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: '#2563EB', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{assignedCount > 9 ? '9+' : assignedCount}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, marginTop: 4, color: currentTab === 'assigned' ? '#2563EB' : '#6B7280', fontWeight: currentTab === 'assigned' ? '600' : '400' }}>Assigned</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }} onPress={() => setCurrentTab('profile')}>
          <Ionicons name={currentTab === 'profile' ? 'person' : 'person-outline'} size={24} color={currentTab === 'profile' ? '#4F46E5' : '#9CA3AF'} />
          <Text style={{ fontSize: 12, marginTop: 4, color: currentTab === 'profile' ? '#4F46E5' : '#6B7280', fontWeight: currentTab === 'profile' ? '600' : '400' }}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SecurityDashboardNew;

// screens/SecurityDashboardNew.jsx - Simplified with 3 separate tabs
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, ScrollView, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getIncidents, acknowledgeIncident, getSOSAlerts, getMe } from '../services/api';
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
  // Tab state - 4 tabs: viewer, sos, assigned, profile
  const [currentTab, setCurrentTab] = useState('viewer');
  
  // Incidents state
  const [incidents, setIncidents] = useState([]);
  const [sosAlerts, setSOSAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const acknowledgedIncidentsRef = useRef(new Set());

  // Profile state
  const [userProfile, setUserProfile] = useState(null);

  // Fetch all data
  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [incidentsResponse, sosResponse, profileResponse] = await Promise.all([
        getIncidents(),
        getSOSAlerts(),
        getMe('security')
      ]);
      
      if (profileResponse.success) {
        setUserProfile(profileResponse.data);
        await AsyncStorage.setItem('securityUser', JSON.stringify(profileResponse.data));
      }
      
      const currentUserId = profileResponse.data?.id;
      
      if (incidentsResponse.success) {
        const processedIncidents = incidentsResponse.data.map(inc => {
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
      
      if (sosResponse.success) {
        const processedSOS = sosResponse.data.map(sos => {
          let enhanced = { ...sos };
          if (acknowledgedIncidentsRef.current.has(sos.id)) {
            enhanced.acknowledged = true;
            enhanced.status = 'acknowledged';
          }
          if (sos.acknowledged || sos.status === 'acknowledged') {
            acknowledgedIncidentsRef.current.add(sos.id);
          }
          return enhanced;
        });
        setSOSAlerts(processedSOS);
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
          ? { ...inc, acknowledged: true, status: 'acknowledged' } 
          : inc
      );
      
      if (isSOS) setSOSAlerts(updateFunc);
      else setIncidents(updateFunc);
      
      acknowledgedIncidentsRef.current.add(incidentId);
      
      const res = await acknowledgeIncident(incidentId);
      
      if (res.success) {
        Alert.alert('Success', 'Incident handled! Admin and reporter have been notified.', [{ text: 'OK' }]);
      } else {
        const revertFunc = (prev) => prev.map(inc => 
          inc.id === incidentId 
            ? { ...inc, acknowledged: false, status: 'pending' } 
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
        {/* Category Badge */}
        <View style={{ backgroundColor: categoryColor + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, alignSelf: 'flex-start', marginBottom: 12 }}>
          <Text style={{ color: categoryColor, fontSize: 11, fontWeight: '700' }}>{categoryLabel}</Text>
        </View>
        
        {/* Incident Info */}
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

        {/* Badges */}
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

        {/* Description */}
        {item.description && (
          <View style={{ padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: categoryColor }}>
            <Text style={{ fontSize: 13, color: '#1F2937', lineHeight: 20 }}>{item.description}</Text>
          </View>
        )}

        {/* Handle Button */}
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

  // Tab renderers
  const renderViewerReportsTab = () => {
    const viewerReports = incidents.filter(i => i.description?.startsWith('[VIEWER REPORT]'));
    const unhandledCount = viewerReports.filter(i => !i.acknowledged && i.status !== 'acknowledged').length;

    return (
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7C3AED']} />}>
        <View style={{ padding: 16 }}>
          {loading ? (
            <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 32 }} />
          ) : viewerReports.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', padding: 32, borderRadius: 12, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" />
              <Text style={{ color: '#1F2937', fontSize: 20, fontWeight: '600', marginTop: 16 }}>No viewer reports</Text>
            </View>
          ) : (
            <>
              {unhandledCount > 0 && (
                <View style={{ padding: 16, borderRadius: 10, marginBottom: 16, backgroundColor: '#FEF3C7', flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="warning-outline" size={24} color="#D97706" style={{ marginRight: 12 }} />
                  <Text style={{ color: '#92400E', fontSize: 15, fontWeight: '600', flex: 1 }}>
                    {unhandledCount} report{unhandledCount !== 1 ? 's' : ''} need{unhandledCount === 1 ? 's' : ''} attention
                  </Text>
                </View>
              )}
              <FlatList
                data={viewerReports}
                renderItem={({ item }) => renderIncidentCard(item, '👁️ VIEWER REPORT', '#7C3AED', false)}
                keyExtractor={(item) => `viewer-${item.id}`}
                scrollEnabled={false}
              />
            </>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderSOSAlertsTab = () => {
    const unhandledCount = sosAlerts.filter(i => !i.acknowledged && i.status !== 'acknowledged').length;

    return (
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#DC2626']} />}>
        <View style={{ padding: 16 }}>
          {loading ? (
            <ActivityIndicator size="large" color="#DC2626" style={{ marginTop: 32 }} />
          ) : sosAlerts.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', padding: 32, borderRadius: 12, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" />
              <Text style={{ color: '#1F2937', fontSize: 20, fontWeight: '600', marginTop: 16 }}>No SOS alerts</Text>
            </View>
          ) : (
            <>
              {unhandledCount > 0 && (
                <View style={{ padding: 16, borderRadius: 10, marginBottom: 16, backgroundColor: '#FEE2E2', flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="alert-circle" size={24} color="#DC2626" style={{ marginRight: 12 }} />
                  <Text style={{ color: '#991B1B', fontSize: 15, fontWeight: '600', flex: 1 }}>
                    {unhandledCount} SOS alert{unhandledCount !== 1 ? 's' : ''} active
                  </Text>
                </View>
              )}
              <FlatList
                data={sosAlerts}
                renderItem={({ item }) => renderIncidentCard(item, '🚨 SOS ALERT', '#DC2626', true)}
                keyExtractor={(item) => `sos-${item.id}`}
                scrollEnabled={false}
              />
            </>
          )}
        </View>
      </ScrollView>
    );
  };

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

  const renderProfileTab = () => {
    return (
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />}>
        <View style={{ padding: 16 }}>
          <View style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 20 }}>Profile</Text>
            
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
  const viewerCount = useMemo(() => incidents.filter(i => i.description?.startsWith('[VIEWER REPORT]') && !i.acknowledged && i.status !== 'acknowledged').length, [incidents]);
  const sosCount = useMemo(() => sosAlerts.filter(i => !i.acknowledged && i.status !== 'acknowledged').length, [sosAlerts]);
  const assignedCount = useMemo(() => incidents.filter(i => userProfile?.id && i.assigned_user_id === userProfile.id && !i.acknowledged && i.status !== 'acknowledged').length, [incidents, userProfile]);
  const totalPending = viewerCount + sosCount + assignedCount;

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
      {currentTab === 'viewer' && renderViewerReportsTab()}
      {currentTab === 'sos' && renderSOSAlertsTab()}
      {currentTab === 'assigned' && renderAssignedTab()}
      {currentTab === 'profile' && renderProfileTab()}

      {/* Bottom Navigation */}
      <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingBottom: 10, paddingTop: 8, flexDirection: 'row' }}>
        <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }} onPress={() => setCurrentTab('viewer')}>
          <View style={{ position: 'relative' }}>
            <Ionicons name={currentTab === 'viewer' ? 'eye' : 'eye-outline'} size={24} color={currentTab === 'viewer' ? '#7C3AED' : '#9CA3AF'} />
            {viewerCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: '#7C3AED', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{viewerCount > 9 ? '9+' : viewerCount}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, marginTop: 4, color: currentTab === 'viewer' ? '#7C3AED' : '#6B7280', fontWeight: currentTab === 'viewer' ? '600' : '400' }}>Viewer</Text>
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

// screens/SecurityDashboardNew.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, ScrollView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getIncidents, acknowledgeIncident, getSOSAlerts, getMe, updateUser, markIncidentAsHandled } from '../services/api';
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
  // Tab state
  const [currentTab, setCurrentTab] = useState('incidents');
  
  // Incidents state
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const acknowledgedIncidentsRef = useRef(new Set());

  // SOS Alerts state
  const [sosAlerts, setSOSAlerts] = useState([]);
  const [loadingSOS, setLoadingSOS] = useState(false);

  // Profile state
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Fetch incidents - only show viewer-reported incidents
  const fetchIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      
      // Handle 401 Unauthorized - token expired or invalid
      if (response && response.status === 401) {
        console.warn('[SecurityDashboard] Unauthorized - redirecting to login');
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please login again.',
          [
            {
              text: 'OK',
              onPress: async () => {
                await AsyncStorage.multiRemove(['userToken', 'user']);
                navigation.replace('SecurityLogin');
              }
            }
          ]
        );
        setLoadingIncidents(false);
        return;
      }
      
      if (response.success) {
        // Log first incident to see structure
        if (response.data.length > 0) {
          console.log('[SecurityDashboard] Sample incident structure:', JSON.stringify(response.data[0], null, 2));
        }
        
        // Filter to only show incidents reported by viewers
        const viewerReportedIncidents = response.data.filter(incident => {
          // Check if incident was reported by a viewer (description starts with [VIEWER REPORT])
          const isViewerReport = incident.description?.startsWith('[VIEWER REPORT]');
          
          if (isViewerReport) {
            console.log('[SecurityDashboard] Found viewer report:', incident.id, getIncidentTypeLabel(incident.type));
          }
          
          return isViewerReport;
        });
        
        const updatedData = viewerReportedIncidents.map(incident => {
          if (acknowledgedIncidentsRef.current.has(incident.id)) {
            return { ...incident, acknowledged: true, status: 'acknowledged' };
          }
          if (incident.acknowledged === true || incident.status === 'acknowledged') {
            acknowledgedIncidentsRef.current.add(incident.id);
          }
          return incident;
        });
        
        console.log('[SecurityDashboard] Total incidents:', response.data.length, 'Viewer reports:', updatedData.length);
        setIncidents(updatedData);
      } else {
        Alert.alert('Error', response.message || 'Failed to fetch incidents.');
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoadingIncidents(false);
    }
  };

  // Fetch SOS alerts
  const fetchSOSAlerts = async () => {
    setLoadingSOS(true);
    try {
      console.log('[SecurityDashboard] Fetching SOS alerts...');
      const response = await getSOSAlerts();
      console.log('[SecurityDashboard] SOS alerts response:', response);
      if (response.success) {
        console.log('[SecurityDashboard] Setting SOS alerts, count:', response.data?.length);
        setSOSAlerts(response.data || []);
      } else {
        console.error('Failed to fetch SOS alerts:', response.message);
        Alert.alert('Error', `Failed to fetch SOS alerts: ${response.message}`);
      }
    } catch (error) {
      console.error('Error fetching SOS alerts:', error);
      Alert.alert('Error', 'Failed to fetch SOS alerts');
    } finally {
      setLoadingSOS(false);
    }
  };

  // Fetch profile
  const fetchProfile = async () => {
    setLoadingProfile(true);
    try {
      const response = await getMe('security');
      if (response.success) {
        setUserProfile(response.data);
        await AsyncStorage.setItem('securityUser', JSON.stringify(response.data));
      } else {
        console.error('Failed to fetch profile:', response.message);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Initial load and auto-refresh
  useEffect(() => {
    fetchIncidents();
    fetchProfile();
    fetchSOSAlerts();
    const incidentInterval = setInterval(() => fetchIncidents(), 15000);
    const sosInterval = setInterval(() => fetchSOSAlerts(), 15000);
    return () => {
      clearInterval(incidentInterval);
      clearInterval(sosInterval);
    };
  }, []);

  // Tab change effects
  useEffect(() => {
    if (currentTab === 'alerts') {
      fetchSOSAlerts();
    } else if (currentTab === 'profile') {
      fetchProfile();
    }
  }, [currentTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (currentTab === 'incidents') {
      await fetchIncidents();
    } else if (currentTab === 'alerts') {
      await fetchSOSAlerts();
    } else if (currentTab === 'profile') {
      await fetchProfile();
    }
    setRefreshing(false);
  };

  const acknowledge = async (incidentId) => {
    try {
      setActionLoading(prev => ({ ...prev, [incidentId]: true }));
      
      setIncidents(prev => {
        const updated = prev.map(inc => 
          inc.id === incidentId 
            ? { ...inc, acknowledged: true, status: 'acknowledged' } 
            : inc
        );
        return updated;
      });
      
      acknowledgedIncidentsRef.current.add(incidentId);
      
      const res = await acknowledgeIncident(incidentId);
      
      if (res.success) {
        Alert.alert(
          'Success', 
          'Incident marked as handled. Admin and incident reporter have been notified.',
          [{ text: 'OK' }]
        );
      } else {
        setIncidents(prev => prev.map(inc => 
          inc.id === incidentId 
            ? { ...inc, acknowledged: false, status: 'pending' } 
            : inc
        ));
        acknowledgedIncidentsRef.current.delete(incidentId);
        Alert.alert('Error', res.message || 'Failed to acknowledge incident');
      }
    } catch (e) {
      console.error('Acknowledge error:', e);
      setIncidents(prev => prev.map(inc => 
        inc.id === incidentId 
          ? { ...inc, acknowledged: false, status: 'pending' } 
          : inc
      ));
      acknowledgedIncidentsRef.current.delete(incidentId);
      Alert.alert('Error', 'Failed to acknowledge incident');
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  // Render Incidents Tab
  const renderIncidentsTab = () => {
    const unhandledCount = incidents.filter(i => !(i.status === 'acknowledged' || i.acknowledged === true)).length;

    const renderIncidentItem = ({ item }) => {
      // Extract username from description if it's a viewer report
      let reporterUsername = null;
      if (item.description?.startsWith('[VIEWER REPORT]')) {
        const contactMatch = item.description.match(/Contact:\s*(\d+)/);
        if (contactMatch) {
          reporterUsername = `Viewer (${contactMatch[1]})`;
        } else {
          reporterUsername = 'Viewer Report';
        }
      }
      
      const ownerName = reporterUsername || userProfile?.username || item.camera?.admin_user?.username || item.assigned_user?.username || 'Security';
      const cameraName = item.camera?.name;
      const location = item.camera?.location;
      const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;
      const severity = item.severity || 'medium';
      const severityColor = severity === 'high' ? '#EF4444' : severity === 'medium' ? '#F59E0B' : '#10B981';

      return (
        <View style={{ backgroundColor: '#FFFFFF', padding: 16, marginBottom: 12, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}
            onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 4 }}>Incident #{item.id}</Text>
              
              {/* Show incident type */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="alert-circle-outline" size={16} color="#6B7280" />
                <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 6, fontWeight: '600' }}>{getIncidentTypeLabel(item.type)}</Text>
              </View>
              
              {/* Only show camera if it exists and has a valid name */}
              {cameraName && cameraName !== 'Manual Reports (Viewer Submissions)' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="videocam-outline" size={16} color="#6B7280" />
                  <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 6 }}>{cameraName}</Text>
                </View>
              )}
              
              {/* Only show location if it exists and is not generic */}
              {location && location !== 'N/A - User Reported' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="location-outline" size={16} color="#6B7280" />
                  <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 6 }}>{location}</Text>
                </View>
              )}
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="person-outline" size={16} color="#6B7280" />
                <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 6 }}>{ownerName}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="time-outline" size={16} color="#6B7280" />
                <Text style={{ fontSize: 13, color: '#9CA3AF', marginLeft: 6 }}>
                  {new Date(item.timestamp).toLocaleString()}
                </Text>
              </View>
            </View>
            
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 8, backgroundColor: severityColor }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                  {severity.toUpperCase()}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: acknowledged ? '#10B981' : '#EF4444' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                  {acknowledged ? 'HANDLED' : 'PENDING'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Full Description */}
          {item.description && (
            <View style={{ 
              marginTop: 8, 
              padding: 12, 
              backgroundColor: '#F9FAFB', 
              borderRadius: 8,
              borderLeftWidth: 3,
              borderLeftColor: '#4F46E5'
            }}>
              <Text style={{ fontSize: 13, color: '#1F2937', lineHeight: 20 }}>
                {item.description}
              </Text>
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />}
      >
        <View style={{ padding: 16 }}>
          {loadingIncidents ? (
            <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 32 }} />
          ) : incidents.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', padding: 32, borderRadius: 12, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" />
              <Text style={{ color: '#1F2937', fontSize: 20, fontWeight: '600', marginTop: 16 }}>No incidents</Text>
              <Text style={{ color: '#6B7280', fontSize: 15, marginTop: 8 }}>All clear</Text>
            </View>
          ) : (
            <>
              {unhandledCount > 0 && (
                <View style={{ padding: 16, borderRadius: 10, marginBottom: 16, backgroundColor: '#FEF3C7', flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="warning-outline" size={24} color="#D97706" style={{ marginRight: 12 }} />
                  <Text style={{ color: '#92400E', fontSize: 15, fontWeight: '600', flex: 1 }}>
                    {unhandledCount} incident{unhandledCount !== 1 ? 's' : ''} require{unhandledCount === 1 ? 's' : ''} attention
                  </Text>
                </View>
              )}
              
              <FlatList
                data={incidents}
                renderItem={renderIncidentItem}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
              />
            </>
          )}
        </View>
      </ScrollView>
    );
  };

  // Render Emergency Alerts Tab
  const renderAlertsTab = () => {
    const renderAlertItem = ({ item }) => {
      // Parse user information from description
      let userName = 'Unknown User';
      let userEmail = 'N/A';
      let userPhone = 'N/A';
      let sosMessage = item.description || '';
      
      if (item.description?.startsWith('[SOS ALERT]')) {
        // Extract user info from description
        const userMatch = item.description.match(/User:\s*([^\n]+)/);
        const emailMatch = item.description.match(/Email:\s*([^\n]+)/);
        const phoneMatch = item.description.match(/Phone:\s*([^\n]+)/);
        
        if (userMatch) userName = userMatch[1].trim();
        if (emailMatch) userEmail = emailMatch[1].trim();
        if (phoneMatch) userPhone = phoneMatch[1].trim();
        
        // Extract just the SOS message part (before user info)
        const messagePart = item.description.split('\n\n')[0];
        sosMessage = messagePart.replace('[SOS ALERT] ', '');
      }
      
      const isHandled = item.status === 'acknowledged' || item.acknowledged === true;

      return (
        <View style={{ backgroundColor: '#FFFFFF', padding: 16, marginBottom: 12, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#EF4444' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="alert-circle" size={24} color="#EF4444" />
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#DC2626', marginLeft: 8 }}>SOS ALERT</Text>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="person-outline" size={18} color="#4F46E5" />
                <Text style={{ fontSize: 15, color: '#1F2937', marginLeft: 8, fontWeight: '600' }}>{userName}</Text>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="mail-outline" size={18} color="#6B7280" />
                <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 8 }}>{userEmail}</Text>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="call-outline" size={18} color="#6B7280" />
                <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 8 }}>{userPhone}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="time-outline" size={18} color="#6B7280" />
                <Text style={{ fontSize: 14, color: '#9CA3AF', marginLeft: 8 }}>
                  {new Date(item.timestamp).toLocaleString()}
                </Text>
              </View>

              {sosMessage && (
                <View style={{ marginTop: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 8 }}>
                  <Text style={{ fontSize: 14, color: '#7F1D1D', lineHeight: 20, fontWeight: '600' }}>{sosMessage}</Text>
                </View>
              )}
            </View>

            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: isHandled ? '#10B981' : '#EF4444' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                {isHandled ? 'HANDLED' : 'ACTIVE'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={{ 
              paddingVertical: 14, 
              borderRadius: 8, 
              backgroundColor: isHandled ? '#10B981' : '#DC2626',
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center'
            }}
            onPress={() => {
              if (!isHandled) {
                acknowledge(item.id);
              }
            }}
            disabled={isHandled || !!actionLoading[item.id]}
          >
            {actionLoading[item.id] ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name={isHandled ? "checkmark-circle" : "flash"} size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
                  {isHandled ? 'Marked as Handled' : 'Respond to Alert'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    };

    return (
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#DC2626']} />}
      >
        <View style={{ padding: 16 }}>
          {/* Info Banner */}
          <View style={{ backgroundColor: '#FEF2F2', padding: 16, borderRadius: 10, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#DC2626' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="information-circle-outline" size={24} color="#DC2626" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#991B1B', fontSize: 14, fontWeight: '600', marginBottom: 4 }}>
                  Emergency Alert Center
                </Text>
                <Text style={{ color: '#7F1D1D', fontSize: 13, lineHeight: 18 }}>
                  SOS alerts triggered by users appear here. Respond immediately to ensure safety.
                </Text>
              </View>
            </View>
          </View>

          {loadingSOS ? (
            <ActivityIndicator size="large" color="#DC2626" style={{ marginTop: 32 }} />
          ) : sosAlerts.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', padding: 32, borderRadius: 12, alignItems: 'center' }}>
              <Ionicons name="shield-checkmark-outline" size={64} color="#10B981" />
              <Text style={{ color: '#1F2937', fontSize: 20, fontWeight: '600', marginTop: 16 }}>No active alerts</Text>
              <Text style={{ color: '#6B7280', fontSize: 15, marginTop: 8, textAlign: 'center' }}>
                No emergency SOS alerts at this time
              </Text>
            </View>
          ) : (
            <FlatList
              data={sosAlerts}
              renderItem={renderAlertItem}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>
    );
  };

  // Render Profile Tab
  const renderProfileTab = () => {
    if (loadingProfile) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      );
    }

    return (
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />}
      >
        <View style={{ padding: 16 }}>
          {/* Profile Header */}
          <View style={{ backgroundColor: '#4F46E5', padding: 24, borderRadius: 12, marginBottom: 16, alignItems: 'center' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 32, color: '#4F46E5', fontWeight: '700' }}>
                {userProfile?.username?.charAt(0).toUpperCase() || 'S'}
              </Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 }}>
              {userProfile?.username || 'Security Personnel'}
            </Text>
            <Text style={{ fontSize: 15, color: '#E0E7FF' }}>
              {userProfile?.email || 'security@example.com'}
            </Text>
            <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>
                SECURITY PERSONNEL
              </Text>
            </View>
          </View>

          {/* Personal Information */}
          <View style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F2937' }}>Personal Information</Text>
              <TouchableOpacity
                onPress={() => {
                  setEditName(userProfile?.username || '');
                  setEditEmail(userProfile?.email || '');
                  setEditPhone(userProfile?.phone || '');
                  setEditProfileModal(true);
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#EEF2FF' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#4F46E5' }}>Edit</Text>
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

          {/* Logout */}
          <View style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }}>
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

  // Calculate unhandled counts
  const unhandledIncidentsCount = useMemo(() => {
    return incidents.filter(i => !(i.status === 'acknowledged' || i.acknowledged === true)).length;
  }, [incidents]);

  const activeAlertsCount = useMemo(() => {
    return sosAlerts.filter(a => !(a.status === 'acknowledged' || a.acknowledged === true)).length;
  }, [sosAlerts]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      {/* Header */}
      <View style={{ backgroundColor: '#4F46E5', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginBottom: 4 }}>Security Dashboard</Text>
        <Text style={{ color: '#C7D2FE', fontSize: 15 }}>
          {unhandledIncidentsCount} pending incident{unhandledIncidentsCount !== 1 ? 's' : ''}
          {activeAlertsCount > 0 && ` • ${activeAlertsCount} active alert${activeAlertsCount !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* Tab Content */}
      {currentTab === 'incidents' && renderIncidentsTab()}
      {currentTab === 'alerts' && renderAlertsTab()}
      {currentTab === 'profile' && renderProfileTab()}

      {/* Bottom Navigation */}
      <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingBottom: 10, paddingTop: 8, flexDirection: 'row' }}>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}
          onPress={() => setCurrentTab('incidents')}
        >
          <View style={{ position: 'relative' }}>
            <Ionicons
              name={currentTab === 'incidents' ? 'list' : 'list-outline'}
              size={24}
              color={currentTab === 'incidents' ? '#4F46E5' : '#9CA3AF'}
            />
            {unhandledIncidentsCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: '#EF4444', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{unhandledIncidentsCount > 9 ? '9+' : unhandledIncidentsCount}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, marginTop: 4, color: currentTab === 'incidents' ? '#4F46E5' : '#6B7280', fontWeight: currentTab === 'incidents' ? '600' : '400' }}>
            Incidents
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}
          onPress={() => setCurrentTab('alerts')}
        >
          <View style={{ position: 'relative' }}>
            <Ionicons
              name={currentTab === 'alerts' ? 'alert-circle' : 'alert-circle-outline'}
              size={24}
              color={currentTab === 'alerts' ? '#DC2626' : '#9CA3AF'}
            />
            {activeAlertsCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: '#DC2626', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{activeAlertsCount > 9 ? '9+' : activeAlertsCount}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, marginTop: 4, color: currentTab === 'alerts' ? '#DC2626' : '#6B7280', fontWeight: currentTab === 'alerts' ? '600' : '400' }}>
            SOS Alerts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}
          onPress={() => setCurrentTab('profile')}
        >
          <Ionicons
            name={currentTab === 'profile' ? 'person' : 'person-outline'}
            size={24}
            color={currentTab === 'profile' ? '#4F46E5' : '#9CA3AF'}
          />
          <Text style={{ fontSize: 12, marginTop: 4, color: currentTab === 'profile' ? '#4F46E5' : '#6B7280', fontWeight: currentTab === 'profile' ? '600' : '400' }}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>

      {/* Edit Profile Modal */}
      <Modal
        visible={editProfileModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditProfileModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 24, paddingBottom: 40, paddingHorizontal: 20, maxHeight: '90%' }}>
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#1F2937' }}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditProfileModal(false)}>
                <Ionicons name="close-circle-outline" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Name Field */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Full Name</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Ionicons name="person-outline" size={20} color="#6B7280" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 16, color: '#1F2937' }}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Enter your name"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Email Field (Read-only) */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Email Address</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F9FAFB' }}>
                  <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={{ marginRight: 10 }} />
                  <Text style={{ flex: 1, fontSize: 16, color: '#6B7280' }}>
                    {editEmail || 'Not set'}
                  </Text>
                  <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
                </View>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Email cannot be changed</Text>
              </View>

              {/* Phone Field */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Phone Number</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Ionicons name="call-outline" size={20} color="#6B7280" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 16, color: '#1F2937' }}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="+1 (555) 000-0000"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={{ marginTop: 24 }}>
              <TouchableOpacity
                style={{ backgroundColor: '#4F46E5', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginBottom: 12 }}
                onPress={async () => {
                  if (!userProfile) return;
                  
                  setSavingProfile(true);
                  try {
                    const res = await updateUser(userProfile.id, {
                      username: editName,
                      phone: editPhone
                    });

                    if (res.success) {
                      setUserProfile(res.data);
                      await AsyncStorage.setItem('user', JSON.stringify(res.data));
                      Alert.alert('Success', 'Profile updated successfully');
                      setEditProfileModal(false);
                    } else {
                      Alert.alert('Error', res.message || 'Failed to update profile');
                    }
                  } catch (error) {
                    console.error('Update profile error:', error);
                    Alert.alert('Error', 'Failed to update profile');
                  } finally {
                    setSavingProfile(false);
                  }
                }}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Save Changes</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ paddingVertical: 16, borderRadius: 10, alignItems: 'center', backgroundColor: '#F3F4F6' }}
                onPress={() => setEditProfileModal(false)}
                disabled={savingProfile}
              >
                <Text style={{ color: '#6B7280', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default SecurityDashboardNew;

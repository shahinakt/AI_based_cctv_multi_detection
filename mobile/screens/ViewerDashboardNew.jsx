import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, StatusBar, Modal, TextInput, ScrollView, Image, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getIncidents, acknowledgeIncidentWithStatus, getUserProfile, getAllEvidence, reportIncident, sendSOSAlert, getMe } from '../services/api';

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

const ViewerDashboardNew = ({ navigation }) => {
  const tailwind = useTailwind();
  const [currentTab, setCurrentTab] = useState('home');
  const [incidents, setIncidents] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [sosModal, setSosModal] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhone2, setEditPhone2] = useState('');
  
  // Report incident state
  const [reportModal, setReportModal] = useState(false);
  const [reportType, setReportType] = useState('theft');
  const [reportSeverity, setReportSeverity] = useState('medium');
  const [reportDescription, setReportDescription] = useState('');
  const [reportLocation, setReportLocation] = useState('');
  const [reportPhone, setReportPhone] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [reportAttachment, setReportAttachment] = useState(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  
  const prevIdsRef = useRef(new Set());
  const handledReportsRef = useRef(new Set());

  // Fetch user profile
  const fetchProfile = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        // Verify this is a viewer user
        if (user.role !== 'viewer') {
          console.warn('[ViewerDashboard] Non-viewer user detected, logging out');
          Alert.alert(
            'Access Denied',
            'This dashboard is for viewers only. Please login with a viewer account.',
            [
              {
                text: 'OK',
                onPress: async () => {
                  await AsyncStorage.multiRemove(['userToken', 'user']);
                  navigation.replace('ViewerLogin');
                }
              }
            ]
          );
          return;
        }
        setUserProfile(user);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  // Fetch incidents
  const fetchIncidents = async (silent = false) => {
    if (!silent) setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      
      // Handle 401 Unauthorized - token expired or invalid
      if (response && response.status === 401) {
        console.warn('[ViewerDashboard] Unauthorized - redirecting to login');
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please login again.',
          [
            {
              text: 'OK',
              onPress: async () => {
                await AsyncStorage.multiRemove(['userToken', 'user']);
                navigation.replace('ViewerLogin');
              }
            }
          ]
        );
        return;
      }
      
      if (response && response.success) {
        const newList = response.data || [];
        // Filter: Include SOS alerts sent by this viewer, but exclude viewer-reported incidents
        const filteredList = newList.filter(incident => {
          // Include if it's an SOS alert sent by this viewer
          if (incident.description?.startsWith('[SOS ALERT]')) {
            // Check if this SOS contains the current user's info
            const currentUsername = userProfile?.username || '';
            if (currentUsername && incident.description?.includes(`User: ${currentUsername}`)) {
              return true;
            }
          }
          // Exclude viewer reports (those are for security only)
          if (incident.description?.startsWith('[VIEWER REPORT]')) {
            return false;
          }
          // Include all other incidents
          return true;
        });
        setIncidents(filteredList);
        prevIdsRef.current = new Set(filteredList.map((i) => i.id));
      } else if (response && !response.success) {
        console.error('[ViewerDashboard] Failed to fetch incidents:', response.message);
      }
    } catch (error) {
      console.error('[ViewerDashboard] Error fetching incidents:', error);
    } finally {
      setLoadingIncidents(false);
    }
  };

  // Fetch notifications (security acknowledgments only)
  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      // Get ALL incidents to check for viewer-reported ones
      const response = await getIncidents();
      if (!response || !response.success) {
        return;
      }
      
      const allIncidents = response.data || [];
      
      // Filter for viewer-reported incidents that have been handled
      const viewerReportedIncidents = allIncidents.filter(i => 
        i.description?.startsWith('[VIEWER REPORT]') && i.acknowledged
      );
      
      const securityAcknowledgments = viewerReportedIncidents.map(i => ({
        id: i.id,
        message: `Your reported incident #${i.id} (${i.type?.replace('_', ' ')}) has been handled by security`,
        timestamp: i.acknowledged_at || i.timestamp,
        read: false,
        incidentType: i.type,
        severity: i.severity,
        isMyReport: true
      }));
      
      // Check for new handled reports and show popup
      const newHandledReports = securityAcknowledgments.filter(n => 
        !handledReportsRef.current.has(n.id)
      );
      
      if (newHandledReports.length > 0) {
        newHandledReports.forEach(report => {
          Alert.alert(
            '✓ Report Handled',
            `Your reported incident #${report.id} has been handled by security officials.`,
            [{ text: 'OK' }]
          );
          handledReportsRef.current.add(report.id);
        });
      }
      
      // Update all handled report IDs
      securityAcknowledgments.forEach(n => handledReportsRef.current.add(n.id));
      
      setNotifications(securityAcknowledgments);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // Fetch evidence
  const fetchEvidence = async () => {
    setLoadingEvidence(true);
    try {
      const response = await getAllEvidence();
      if (response && response.success) {
        setEvidence(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching evidence:', error);
    } finally {
      setLoadingEvidence(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchProfile();
    fetchIncidents();
    
    // Auto-refresh incidents every 15 seconds
    const incidentInterval = setInterval(() => {
      if (mounted) {
        fetchIncidents(true);
      }
    }, 15000);
    
    // Auto-check for handled reports every 10 seconds
    const notificationInterval = setInterval(() => {
      if (mounted) {
        fetchNotifications();
      }
    }, 10000);
    
    return () => {
      mounted = false;
      clearInterval(incidentInterval);
      clearInterval(notificationInterval);
    };
  }, []);

  // Fetch data when tab changes
  useEffect(() => {
    if (currentTab === 'notifications') {
      fetchNotifications();
    }
    if (currentTab === 'evidence') {
      fetchEvidence();
    }
  }, [currentTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    if (currentTab === 'notifications') {
      await fetchNotifications();
    }
    if (currentTab === 'evidence') {
      await fetchEvidence();
    }
    setRefreshing(false);
  };

  const handleSOS = async () => {
    try {
      const message = sosMessage.trim() || 'Emergency SOS Alert!';
      console.log('[ViewerDashboard] Sending SOS alert:', message);
      console.log('[ViewerDashboard] User profile:', userProfile);
      
      // Prepare user information
      const userInfo = {
        username: userProfile?.username || 'Unknown User',
        phone: userProfile?.phone || editPhone || 'N/A',
        email: userProfile?.email || 'N/A'
      };
      
      const response = await sendSOSAlert(message, 'Mobile App', userInfo);
      
      if (response.success) {
        Alert.alert(
          '✓ SOS Sent', 
          'Emergency alert has been sent to security personnel',
          [{ text: 'OK' }]
        );
        setSosModal(false);
        setSosMessage('');
        // Refresh incidents to show the new SOS alert
        fetchIncidents();
      } else {
        console.error('[ViewerDashboard] Failed to send SOS:', response.message);
        Alert.alert(
          'Error', 
          `Failed to send SOS alert: ${response.message || 'Unknown error'}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[ViewerDashboard] Exception sending SOS:', error);
      Alert.alert('Error', 'Failed to send SOS alert. Please try again.');
    }
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

  // Render Home Tab (Incidents)
  const renderHomeTab = () => {
    const unhandledCount = incidents.filter(i => !i.acknowledged).length;
    const handledCount = incidents.filter(i => i.acknowledged).length;
    const criticalCount = incidents.filter(i => i.severity === 'critical' || i.severity === 'high').length;

    return (
    <ScrollView 
      style={{ flex: 1 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />
      }
    >
      {/* Welcome Header */}
      <View style={{ 
        backgroundColor: '#4F46E5', 
        padding: 20,
        paddingTop: 60,
        paddingBottom: 30
      }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 }}>
          Welcome Back
        </Text>
        <Text style={{ fontSize: 16, color: '#E0E7FF' }}>
          {userProfile?.username || 'Viewer'}
        </Text>
      </View>

      {/* Statistics Cards */}
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', marginBottom: 16, gap: 12 }}>
          {/* Total Incidents Card */}
          <View style={{ 
            flex: 1, 
            backgroundColor: '#FFFFFF', 
            padding: 16, 
            borderRadius: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3
          }}>
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={32} color="#4F46E5" />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1F2937', marginTop: 8 }}>
                {incidents.length}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4 }}>
                Total Incidents
              </Text>
            </View>
          </View>

          {/* Unhandled Card */}
          <View style={{ 
            flex: 1, 
            backgroundColor: '#FFFFFF', 
            padding: 16, 
            borderRadius: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3
          }}>
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="warning" size={32} color="#EF4444" />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#EF4444', marginTop: 8 }}>
                {unhandledCount}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4 }}>
                Pending
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 20, gap: 12 }}>
          {/* Handled Card */}
          <View style={{ 
            flex: 1, 
            backgroundColor: '#FFFFFF', 
            padding: 16, 
            borderRadius: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3
          }}>
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="checkmark-circle" size={32} color="#10B981" />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#10B981', marginTop: 8 }}>
                {handledCount}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4 }}>
                Handled
              </Text>
            </View>
          </View>

          {/* Critical Card */}
          <View style={{ 
            flex: 1, 
            backgroundColor: '#FFFFFF', 
            padding: 16, 
            borderRadius: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3
          }}>
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="flash" size={32} color="#DC2626" />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#DC2626', marginTop: 8 }}>
                {criticalCount}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4 }}>
                High Priority
              </Text>
            </View>
          </View>
        </View>

        {/* Recent Incidents Section */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>
            Quick Actions
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: '#4F46E5',
                padding: 20,
                borderRadius: 12,
                alignItems: 'center'
              }}
              onPress={() => setCurrentTab('report')}
            >
              <Ionicons name="alert-circle" size={32} color="#FFFFFF" />
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginTop: 8 }}>
                Report Incident
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: '#FFFFFF',
                padding: 20,
                borderRadius: 12,
                alignItems: 'center',
                borderWidth: 2,
                borderColor: '#4F46E5'
              }}
              onPress={() => setCurrentTab('incidents')}
            >
              <Ionicons name="list" size={32} color="#4F46E5" />
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#4F46E5', marginTop: 8 }}>
                View All
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
    );
  };

  // Render Incidents Tab (Full List)
  const renderIncidentsTab = () => (
    <View style={{ flex: 1 }}>
      <View style={{ 
        backgroundColor: '#FFFFFF', 
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1F2937' }}>All Incidents</Text>
          <View style={{ 
            backgroundColor: '#EF4444', 
            paddingHorizontal: 12, 
            paddingVertical: 6, 
            borderRadius: 12 
          }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' }}>
              {incidents.filter(i => !i.acknowledged).length} Pending
            </Text>
          </View>
        </View>
      </View>

      {loadingIncidents ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading incidents...</Text>
        </View>
      ) : incidents.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937', marginTop: 16 }}>
            All Clear
          </Text>
          <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
            No incidents reported
          </Text>
        </View>
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />
          }
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3
              }}
              onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1F2937' }}>
                    #{item.id} • {getIncidentTypeLabel(item.type)}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                    {item.description || 'No description available'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <View style={{ 
                  backgroundColor: getSeverityColor(item.severity), 
                  paddingHorizontal: 10, 
                  paddingVertical: 4, 
                  borderRadius: 6 
                }}>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#FFFFFF' }}>
                    {item.severity?.toUpperCase()}
                  </Text>
                </View>
                <View style={{ 
                  backgroundColor: item.acknowledged ? '#10B981' : '#EF4444', 
                  paddingHorizontal: 10, 
                  paddingVertical: 4, 
                  borderRadius: 6 
                }}>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#FFFFFF' }}>
                    {item.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}
                </Text>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 6,
                    backgroundColor: '#EEF2FF'
                  }}
                  onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#4F46E5' }}>Details</Text>
                </TouchableOpacity>
              </View>

              {!item.acknowledged && (
                <TouchableOpacity
                  style={{
                    marginTop: 12,
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: '#4F46E5',
                    alignItems: 'center'
                  }}
                  onPress={async () => {
                    const res = await acknowledgeIncidentWithStatus(item.id, true);
                    if (res?.success) {
                      Alert.alert('Success', 'Incident acknowledged');
                      fetchIncidents(true);
                    }
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' }}>
                    Acknowledge
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );

  // Render Notifications Tab
  const renderNotificationsTab = () => (
      <View style={{ flex: 1 }}>
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB'
        }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1F2937' }}>Notifications</Text>
          <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            Updates from security officials
          </Text>
        </View>

        {loadingNotifications ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        ) : notifications.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Ionicons name="notifications-off" size={64} color="#D1D5DB" />
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937', marginTop: 16 }}>
              No Notifications
            </Text>
            <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
              You'll be notified when security handles incidents
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />
            }
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <View style={{
                backgroundColor: item.isMyReport ? '#EEF2FF' : '#FFFFFF',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                borderLeftWidth: 4,
                borderLeftColor: item.isMyReport ? '#4F46E5' : '#10B981',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3
              }}>
                {item.isMyReport && (
                  <View style={{
                    backgroundColor: '#4F46E5',
                    alignSelf: 'flex-start',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 4,
                    marginBottom: 8
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#FFFFFF' }}>
                      YOUR REPORT
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{
                    backgroundColor: item.isMyReport ? '#C7D2FE' : '#D1FAE5',
                    padding: 8,
                    borderRadius: 8,
                    marginRight: 12
                  }}>
                    <Ionicons 
                      name="checkmark-circle" 
                      size={24} 
                      color={item.isMyReport ? '#4F46E5' : '#10B981'} 
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                      {item.message}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        )}
      </View>
  );

  // Handle report submission
  const handleSubmitReport = async () => {
    if (!reportDescription.trim()) {
      Alert.alert('Required Field', 'Please provide a description of the incident');
      return;
    }

    console.log('[ViewerDashboard] Submitting report...');
    setSubmittingReport(true);
    setReportSubmitted(false);
    
    try {
      const response = await reportIncident({
        type: reportType,
        severity: reportSeverity,
        description: reportDescription,
        location: reportLocation || 'Not specified',
        phone: reportPhone,
        notes: reportNotes
      }, reportAttachment);

      console.log('[ViewerDashboard] Report response:', JSON.stringify(response, null, 2));
      console.log('[ViewerDashboard] Response success field:', response?.success);
      console.log('[ViewerDashboard] Response success type:', typeof response?.success);

      if (response && response.success === true) {
        console.log('[ViewerDashboard] Report submitted successfully! Setting success state...');
        
        // FIRST: Stop submitting and show success state
        setSubmittingReport(false);
        setReportSubmitted(true);
        
        console.log('[ViewerDashboard] Success states set. Should now show "Submitted Successfully"');
        
        // THEN: Show success alert after a brief delay to let UI update
        setTimeout(() => {
          Alert.alert(
            '✓ Report Submitted', 
            'Your incident report has been sent to security officials.',
            [{ text: 'OK' }]
          );
        }, 500);
        
        // Reset form and navigate after 3 seconds to show success state longer
        setTimeout(() => {
          setReportDescription('');
          setReportLocation('');
          setReportPhone('');
          setReportNotes('');
          setReportType('theft');
          setReportSeverity('medium');
          setReportAttachment(null);
          setReportSubmitted(false);
          setCurrentTab('home');
          fetchIncidents();
        }, 3000);
      } else {
        console.error('[ViewerDashboard] Report failed:', response?.message || 'Unknown error');
        console.error('[ViewerDashboard] Full response:', response);
        setSubmittingReport(false);
        setReportSubmitted(false);
        Alert.alert(
          'Submission Failed', 
          response?.message || 'Failed to submit report. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[ViewerDashboard] Exception caught:', error);
      setSubmittingReport(false);
      setReportSubmitted(false);
      Alert.alert(
        'Error', 
        'An unexpected error occurred. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  // Render Report Tab
  const renderReportTab = () => (
    <ScrollView style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <View style={{ 
        backgroundColor: '#4F46E5', 
        padding: 20,
        paddingTop: 60,
        paddingBottom: 30
      }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 12
          }}>
            <Ionicons name="alert-circle" size={40} color="#4F46E5" />
          </View>
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#FFFFFF' }}>
            Report Incident
          </Text>
          <Text style={{ fontSize: 14, color: '#E0E7FF', textAlign: 'center', marginTop: 8 }}>
            Report suspicious activities or incidents to security officials
          </Text>
        </View>
      </View>

      <View style={{ padding: 16 }}>
        {/* Incident Type */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>
            Incident Type
          </Text>
          
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { value: 'abuse_violence', label: 'Abuse/Violence', icon: 'alert-circle-outline' },
              { value: 'theft', label: 'Theft', icon: 'bag-remove-outline' },
              { value: 'fall_health', label: 'Fall/Health Issue', icon: 'medkit-outline' },
              { value: 'accident_car_theft', label: 'Other', icon: 'ellipsis-horizontal' }
            ].map(type => (
              <TouchableOpacity
                key={type.value}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: reportType === type.value ? '#4F46E5' : '#E5E7EB',
                  backgroundColor: reportType === type.value ? '#EEF2FF' : '#FFFFFF',
                  marginBottom: 8
                }}
                onPress={() => setReportType(type.value)}
              >
                <Ionicons 
                  name={type.icon} 
                  size={20} 
                  color={reportType === type.value ? '#4F46E5' : '#6B7280'} 
                  style={{ marginRight: 8 }}
                />
                <Text style={{
                  fontSize: 14,
                  fontWeight: reportType === type.value ? '600' : '400',
                  color: reportType === type.value ? '#4F46E5' : '#6B7280'
                }}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Severity Level */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>
            Severity Level
          </Text>
          
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { value: 'low', label: 'Low', color: '#10B981' },
              { value: 'medium', label: 'Medium', color: '#F59E0B' },
              { value: 'high', label: 'High', color: '#EF4444' }
            ].map(sev => (
              <TouchableOpacity
                key={sev.value}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: reportSeverity === sev.value ? sev.color : '#E5E7EB',
                  backgroundColor: reportSeverity === sev.value ? `${sev.color}15` : '#FFFFFF',
                  alignItems: 'center'
                }}
                onPress={() => setReportSeverity(sev.value)}
              >
                <Text style={{
                  fontSize: 14,
                  fontWeight: reportSeverity === sev.value ? '600' : '400',
                  color: reportSeverity === sev.value ? sev.color : '#6B7280'
                }}>
                  {sev.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Description */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>
            Description *
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#D1D5DB',
              borderRadius: 8,
              padding: 12,
              fontSize: 14,
              color: '#1F2937',
              minHeight: 100,
              textAlignVertical: 'top'
            }}
            placeholder="Describe what you observed..."
            placeholderTextColor="#9CA3AF"
            value={reportDescription}
            onChangeText={setReportDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Location */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>
            Location
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#D1D5DB',
              borderRadius: 8,
              padding: 12,
              fontSize: 14,
              color: '#1F2937'
            }}
            placeholder="Building, floor, area..."
            placeholderTextColor="#9CA3AF"
            value={reportLocation}
            onChangeText={setReportLocation}
          />
        </View>

        {/* Contact Phone Number */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>
            Contact Phone Number
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#D1D5DB',
              borderRadius: 8,
              padding: 12,
              fontSize: 14,
              color: '#1F2937'
            }}
            placeholder="+1 (555) 123-4567"
            placeholderTextColor="#9CA3AF"
            value={reportPhone}
            onChangeText={setReportPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Additional Notes */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>
            Additional Notes
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#D1D5DB',
              borderRadius: 8,
              padding: 12,
              fontSize: 14,
              color: '#1F2937',
              minHeight: 80,
              textAlignVertical: 'top'
            }}
            placeholder="Any additional information..."
            placeholderTextColor="#9CA3AF"
            value={reportNotes}
            onChangeText={setReportNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Attachment/Evidence Upload */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 }}>
            Attachment (Optional)
          </Text>
          
          {reportAttachment ? (
            <View style={{
              borderWidth: 1,
              borderColor: '#10B981',
              borderRadius: 8,
              padding: 12,
              backgroundColor: '#ECFDF5',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Ionicons name="document-attach" size={24} color="#10B981" />
                <Text style={{ 
                  fontSize: 14, 
                  color: '#1F2937', 
                  marginLeft: 8,
                  flex: 1
                }} numberOfLines={1}>
                  {reportAttachment.name || 'Attachment selected'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReportAttachment(null)}>
                <Ionicons name="close-circle" size={24} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={{
                borderWidth: 2,
                borderColor: '#D1D5DB',
                borderStyle: 'dashed',
                borderRadius: 8,
                padding: 20,
                alignItems: 'center',
                backgroundColor: '#F9FAFB'
              }}
              onPress={() => {
                Alert.alert(
                  'Attachment',
                  'Photo/Video attachment feature will be available in the next update.',
                  [{ text: 'OK' }]
                );
              }}
            >
              <Ionicons name="cloud-upload-outline" size={32} color="#9CA3AF" />
              <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 8 }}>
                Tap to attach photo or video evidence
              </Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
                (Coming soon)
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={{
            backgroundColor: reportSubmitted ? '#10B981' : '#4F46E5',
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            marginBottom: 20,
            opacity: (submittingReport || reportSubmitted) ? 0.9 : 1
          }}
          onPress={handleSubmitReport}
          disabled={submittingReport || reportSubmitted}
        >
          {submittingReport ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginLeft: 12 }}>
                Submitting...
              </Text>
            </View>
          ) : reportSubmitted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginLeft: 8 }}>
                Submitted Successfully
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' }}>
              Submit Report to Security
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // Render Profile Tab
  const renderProfileTab = () => (
    <ScrollView style={{ flex: 1 }} refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={async () => {
        setRefreshing(true);
        await fetchProfile();
        setRefreshing(false);
      }} colors={['#4F46E5']} />
    }>
      <View style={{ 
        backgroundColor: '#4F46E5', 
        padding: 20,
        paddingTop: 60,
        paddingBottom: 40
      }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 12
          }}>
            <Ionicons name="person" size={40} color="#4F46E5" />
          </View>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' }}>
            {userProfile?.username || 'User'}
          </Text>
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 12,
            marginTop: 8
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>
              VIEWER
            </Text>
          </View>
        </View>
      </View>

      <View style={{ padding: 16 }}>
        {/* Personal Information */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 16 }}>
            Personal Information
          </Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Full Name</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <Ionicons name="person-outline" size={20} color="#4F46E5" style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 15, color: '#1F2937' }}>
                {userProfile?.username || 'Not set'}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Email</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <Ionicons name="mail-outline" size={20} color="#4F46E5" style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 15, color: '#1F2937' }}>
                {userProfile?.email || 'Not set'}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Phone Number</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <Ionicons name="call-outline" size={20} color="#4F46E5" style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 15, color: '#1F2937' }}>
                {userProfile?.phone || 'Not set'}
              </Text>
            </View>
          </View>
        </View>

        {/* Emergency Contacts */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 16 }}>
            Emergency Contacts
          </Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Primary Contact</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <Ionicons name="call-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 15, color: '#1F2937' }}>
                {userProfile?.emergency_contact_1 || '+1 (555) 123-4567'}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Secondary Contact</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <Ionicons name="call-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 15, color: '#1F2937' }}>
                {userProfile?.emergency_contact_2 || '+1 (555) 987-6543'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={{
              marginTop: 8,
              paddingVertical: 12,
              borderRadius: 8,
              backgroundColor: '#EEF2FF',
              alignItems: 'center'
            }}
            onPress={() => {
              setEditName(userProfile?.username || '');
              setEditEmail(userProfile?.email || '');
              setEditUserPhone(userProfile?.phone || '');
              setEditPhone(userProfile?.emergency_contact_1 || '+1 (555) 123-4567');
              setEditPhone2(userProfile?.emergency_contact_2 || '+1 (555) 987-6543');
              setEditProfileModal(true);
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#4F46E5' }}>
              Edit Profile & Contacts
            </Text>
          </TouchableOpacity>
        </View>

        {/* Settings */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 12
            }}
            onPress={async () => {
              await AsyncStorage.multiRemove(['viewerToken', 'viewerUser', 'userToken', 'user', 'token']);
              navigation.replace('ViewerLogin');
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="log-out-outline" size={24} color="#EF4444" style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#EF4444' }}>Logout</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  // Render Evidence Tab
  const renderEvidenceTab = () => (
      <View style={{ flex: 1 }}>
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB'
        }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1F2937' }}>Evidence Storage</Text>
          <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            All incident evidence with blockchain verification
          </Text>
        </View>

        {loadingEvidence ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        ) : evidence.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Ionicons name="folder-open-outline" size={64} color="#D1D5DB" />
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937', marginTop: 16 }}>
              No Evidence
            </Text>
            <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
              Evidence will appear here when incidents are recorded
            </Text>
          </View>
        ) : (
          <FlatList
            data={evidence}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />
            }
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <View style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3
              }}>
                {/* Evidence Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937' }}>
                      Evidence #{item.id}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                      Incident #{item.incident_id} • {item.incident_type?.replace('_', ' ')}
                    </Text>
                  </View>
                  <View style={{ 
                    backgroundColor: item.uploaded_to_ipfs ? '#D1FAE5' : '#FEF3C7', 
                    paddingHorizontal: 10, 
                    paddingVertical: 4, 
                    borderRadius: 6 
                  }}>
                    <Text style={{ 
                      fontSize: 11, 
                      fontWeight: 'bold', 
                      color: item.uploaded_to_ipfs ? '#059669' : '#D97706' 
                    }}>
                      {item.uploaded_to_ipfs ? 'IPFS' : 'Local'}
                    </Text>
                  </View>
                </View>

                {/* Evidence Preview */}
                {item.file_path && (item.file_type === 'image' || item.file_path.match(/\.(jpg|jpeg|png|gif)$/i)) && (
                  <View style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden' }}>
                    <Image 
                      source={{ uri: item.file_path }} 
                      style={{ width: '100%', height: 200 }} 
                      resizeMode="cover"
                      onError={() => console.log('Image load error')}
                    />
                  </View>
                )}

                {/* Evidence Details */}
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="document-text-outline" size={18} color="#6B7280" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 13, color: '#6B7280' }}>Type: </Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1F2937' }}>
                      {item.file_type || 'Unknown'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={18} color="#6B7280" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 13, color: '#6B7280' }}>Created: </Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1F2937' }}>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : 
                       item.incident_timestamp ? new Date(item.incident_timestamp).toLocaleString() : 'N/A'}
                    </Text>
                  </View>

                  {item.sha256_hash && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      <Ionicons name="shield-checkmark-outline" size={18} color="#6B7280" style={{ marginRight: 8, marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#6B7280' }}>SHA-256 Hash:</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#1F2937', marginTop: 4 }} numberOfLines={1}>
                          {item.sha256_hash}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            await Share.share({ message: item.sha256_hash });
                          } catch (e) {}
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="copy-outline" size={18} color="#4F46E5" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {item.blockchain_tx && (
                    <View style={{ 
                      marginTop: 8, 
                      padding: 12, 
                      backgroundColor: '#EEF2FF', 
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#C7D2FE'
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Ionicons name="link-outline" size={18} color="#4F46E5" style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#4F46E5' }}>
                          Blockchain Verified
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Transaction ID:</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#1F2937', flex: 1 }} numberOfLines={1}>
                          {item.blockchain_tx}
                        </Text>
                        <TouchableOpacity
                          onPress={async () => {
                            try {
                              await Share.share({ message: `Blockchain TX: ${item.blockchain_tx}` });
                            } catch (e) {}
                          }}
                          style={{ marginLeft: 8, padding: 4 }}
                        >
                          <Ionicons name="share-social-outline" size={18} color="#4F46E5" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {item.description && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Description:</Text>
                      <Text style={{ fontSize: 13, color: '#1F2937', lineHeight: 18 }}>
                        {item.description}
                      </Text>
                    </View>
                  )}
                </View>

                {/* View Incident Button */}
                <TouchableOpacity
                  style={{
                    marginTop: 12,
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: '#EEF2FF',
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center'
                  }}
                  onPress={() => {
                    const incident = incidents.find(i => i.id === item.incident_id);
                    if (incident) {
                      navigation.navigate('IncidentDetail', { incident });
                    } else {
                      Alert.alert('Info', 'Incident details not available');
                    }
                  }}
                >
                  <Ionicons name="eye-outline" size={18} color="#4F46E5" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#4F46E5' }}>
                    View Incident Details
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Render current tab content */}
      {currentTab === 'home' && renderHomeTab()}
      {currentTab === 'incidents' && renderIncidentsTab()}
      {currentTab === 'report' && renderReportTab()}
      {currentTab === 'evidence' && renderEvidenceTab()}
      {currentTab === 'notifications' && renderNotificationsTab()}
      {currentTab === 'profile' && renderProfileTab()}

      {/* SOS Button */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: 80,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: '#DC2626',
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 8
        }}
        onPress={() => setSosModal(true)}
      >
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' }}>SOS</Text>
      </TouchableOpacity>

      {/* Bottom Navigation */}
      <View style={{
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        paddingVertical: 12,
        paddingBottom: 20,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 8
      }}>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          onPress={() => setCurrentTab('home')}
        >
          <Ionicons 
            name={currentTab === 'home' ? 'home' : 'home-outline'} 
            size={24} 
            color={currentTab === 'home' ? '#4F46E5' : '#9CA3AF'} 
          />
          <Text style={{ 
            fontSize: 11, 
            marginTop: 4, 
            color: currentTab === 'home' ? '#4F46E5' : '#9CA3AF',
            fontWeight: currentTab === 'home' ? 'bold' : 'normal'
          }}>
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          onPress={() => setCurrentTab('incidents')}
        >
          <View>
            <Ionicons 
              name={currentTab === 'incidents' ? 'list' : 'list-outline'} 
              size={24} 
              color={currentTab === 'incidents' ? '#4F46E5' : '#9CA3AF'} 
            />
            {incidents.filter(i => !i.acknowledged).length > 0 && (
              <View style={{
                position: 'absolute',
                top: -4,
                right: -8,
                backgroundColor: '#EF4444',
                borderRadius: 10,
                minWidth: 20,
                height: 20,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 4
              }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>
                  {incidents.filter(i => !i.acknowledged).length}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ 
            fontSize: 11, 
            marginTop: 4, 
            color: currentTab === 'incidents' ? '#4F46E5' : '#9CA3AF',
            fontWeight: currentTab === 'incidents' ? 'bold' : 'normal'
          }}>
            Incidents
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          onPress={() => setCurrentTab('report')}
        >
          <Ionicons 
            name={currentTab === 'report' ? 'alert-circle' : 'alert-circle-outline'} 
            size={24} 
            color={currentTab === 'report' ? '#4F46E5' : '#9CA3AF'} 
          />
          <Text style={{ 
            fontSize: 11, 
            marginTop: 4, 
            color: currentTab === 'report' ? '#4F46E5' : '#9CA3AF',
            fontWeight: currentTab === 'report' ? 'bold' : 'normal'
          }}>
            Report
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          onPress={() => setCurrentTab('notifications')}
        >
          <View>
            <Ionicons 
              name={currentTab === 'notifications' ? 'notifications' : 'notifications-outline'} 
              size={24} 
              color={currentTab === 'notifications' ? '#4F46E5' : '#9CA3AF'} 
            />
            {notifications.filter(n => !n.read).length > 0 && (
              <View style={{
                position: 'absolute',
                top: -4,
                right: -8,
                backgroundColor: '#10B981',
                borderRadius: 10,
                minWidth: 20,
                height: 20,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 4
              }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>
                  {notifications.filter(n => !n.read).length}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ 
            fontSize: 11, 
            marginTop: 4, 
            color: currentTab === 'notifications' ? '#4F46E5' : '#9CA3AF',
            fontWeight: currentTab === 'notifications' ? 'bold' : 'normal'
          }}>
            Notifications
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          onPress={() => setCurrentTab('evidence')}
        >
          <Ionicons 
            name={currentTab === 'evidence' ? 'folder' : 'folder-outline'} 
            size={24} 
            color={currentTab === 'evidence' ? '#4F46E5' : '#9CA3AF'} 
          />
          <Text style={{ 
            fontSize: 11, 
            marginTop: 4, 
            color: currentTab === 'evidence' ? '#4F46E5' : '#9CA3AF',
            fontWeight: currentTab === 'evidence' ? 'bold' : 'normal'
          }}>
            Evidence
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          onPress={() => setCurrentTab('profile')}
        >
          <Ionicons 
            name={currentTab === 'profile' ? 'person' : 'person-outline'} 
            size={24} 
            color={currentTab === 'profile' ? '#4F46E5' : '#9CA3AF'} 
          />
          <Text style={{ 
            fontSize: 11, 
            marginTop: 4, 
            color: currentTab === 'profile' ? '#4F46E5' : '#9CA3AF',
            fontWeight: currentTab === 'profile' ? 'bold' : 'normal'
          }}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>

      {/* Edit Profile Modal */}
      <Modal visible={editProfileModal} transparent animationType="slide">
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.7)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 400
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1F2937' }}>
                Edit Profile
              </Text>
              <TouchableOpacity onPress={() => setEditProfileModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }}>
              {/* Name Field */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  Full Name
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#D1D5DB',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10
                }}>
                  <Ionicons name="person-outline" size={20} color="#6B7280" style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: '#1F2937' }}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Enter your name"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Email Field (Read-only) */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  Email Address
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#F9FAFB'
                }}>
                  <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
                  <Text style={{ flex: 1, fontSize: 15, color: '#6B7280' }}>
                    {editEmail || 'Not set'}
                  </Text>
                  <Ionicons name="lock-closed-outline" size={16} color="#9CA3AF" />
                </View>
                <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Email cannot be changed</Text>
              </View>

              {/* Phone Number Field */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  Phone Number
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#D1D5DB',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10
                }}>
                  <Ionicons name="call-outline" size={20} color="#6B7280" style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: '#1F2937' }}
                    value={editUserPhone}
                    onChangeText={setEditUserPhone}
                    placeholder="+1 (555) 000-0000"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Primary Contact Field */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  Primary Emergency Contact
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#D1D5DB',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10
                }}>
                  <Ionicons name="call-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: '#1F2937' }}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="+1 (555) 123-4567"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Secondary Contact Field */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  Secondary Emergency Contact
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#D1D5DB',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10
                }}>
                  <Ionicons name="call-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: '#1F2937' }}
                    value={editPhone2}
                    onChangeText={setEditPhone2}
                    placeholder="+1 (555) 987-6543"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={{ marginTop: 20 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#4F46E5',
                  paddingVertical: 14,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginBottom: 12
                }}
                onPress={async () => {
                  try {
                    // TODO: Implement API call to update profile
                    const updatedProfile = {
                      ...userProfile,
                      username: editName,
                      phone: editUserPhone,
                      emergency_contact_1: editPhone,
                      emergency_contact_2: editPhone2
                    };
                    
                    // Update local state
                    setUserProfile(updatedProfile);
                    await AsyncStorage.setItem('user', JSON.stringify(updatedProfile));
                    
                    Alert.alert('Success', 'Profile updated successfully');
                    setEditProfileModal(false);
                  } catch (error) {
                    Alert.alert('Error', 'Failed to update profile');
                  }
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' }}>
                  Save Changes
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  paddingVertical: 14,
                  borderRadius: 8,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#D1D5DB'
                }}
                onPress={() => setEditProfileModal(false)}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#6B7280' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SOS Modal */}
      <Modal visible={sosModal} transparent animationType="slide">
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.7)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 400
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: '#FEE2E2',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12
              }}>
                <Ionicons name="warning" size={40} color="#DC2626" />
              </View>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1F2937' }}>
                Emergency SOS
              </Text>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8 }}>
                Send emergency alert to security and your emergency contacts
              </Text>
            </View>

            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 8,
                padding: 12,
                fontSize: 14,
                color: '#1F2937',
                marginBottom: 20,
                minHeight: 100,
                textAlignVertical: 'top'
              }}
              placeholder="Describe the emergency (optional)"
              placeholderTextColor="#9CA3AF"
              value={sosMessage}
              onChangeText={setSosMessage}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity
              style={{
                backgroundColor: '#DC2626',
                paddingVertical: 14,
                borderRadius: 8,
                alignItems: 'center',
                marginBottom: 12
              }}
              onPress={handleSOS}
            >
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' }}>
                Send SOS Alert
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                paddingVertical: 14,
                borderRadius: 8,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#D1D5DB'
              }}
              onPress={() => {
                setSosModal(false);
                setSosMessage('');
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#6B7280' }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default ViewerDashboardNew;

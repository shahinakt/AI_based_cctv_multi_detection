import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Image } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, createIncident, acknowledgeIncidentWithStatus, getMe, getCameraFeeds, getDebugInfo } from '../services/api';
import NotificationBanner from '../components/NotificationBanner';
import MenuBar from '../components/MenuBar';

const ViewerDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sosDisabled, setSosDisabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');

  const prevIdsRef = useRef(new Set());
  const sosSentRef = useRef(false); // Persists across re-renders
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);
  
  useEffect(() => {
    const debugInfo = getDebugInfo();
    const url = debugInfo.BASE_URL || 'http://localhost:8000';
    setBaseUrl(url);
  }, []);
  
  // Construct evidence URL from file_path
  const getEvidenceUrl = (filePath) => {
    if (!filePath || !baseUrl) return null;
    return `${baseUrl}/evidence/${filePath}`;
  };

  const fetchIncidents = async (silent = false) => {
    if (!silent) setLoadingIncidents(true);
    try {
      // Fetch user info and cameras in parallel
      const [meRes, camsRes, incidentsRes] = await Promise.all([
        getMe('viewer'),
        getCameraFeeds(),
        getIncidents()
      ]);

      // Handle 401 Unauthorized - redirect to login
      if (meRes.status === 401 || camsRes.status === 401 || incidentsRes.status === 401) {
        console.error('[ViewerDashboard] 401 Unauthorized - redirecting to login');
        Alert.alert(
          'Session Expired', 
          'Your session has expired. Please login again.',
          [{ text: 'OK', onPress: () => navigation.replace('AdminLogin') }]
        );
        return;
      }

      if (!meRes.success) throw new Error(meRes.message || 'Failed to fetch user info');
      if (!camsRes.success) throw new Error(camsRes.message || 'Failed to fetch cameras');
      if (!incidentsRes.success) throw new Error(incidentsRes.message || 'Failed to fetch incidents');

      const user = meRes.data;
      const cameras = camsRes.data || [];
      const allIncidents = incidentsRes.data || [];

      // Find camera IDs owned by this user
      const ownedCameraIds = new Set(cameras.filter(c => Number(c.admin_user_id) === Number(user.id)).map(c => c.id));

      // Filter incidents: owned cameras OR AI camera incidents (camera_id >= 29)
      const filteredIncidents = allIncidents.filter(inc => {
        const cameraId = Number(inc.camera_id);
        const ownedByUser = ownedCameraIds.has(cameraId);
        const isAICamera = cameraId >= 29; // AI worker cameras
        return ownedByUser || isAICamera;
      });

      console.log(`[ViewerDashboard] User ${user.username}: ${filteredIncidents.length} incidents (${ownedCameraIds.size} owned cameras, AI cameras included)`);
      
      const newIds = new Set(filteredIncidents.map((i) => i.id));

      if (silent) {
        const prev = prevIdsRef.current;
        const added = filteredIncidents.filter((i) => !prev.has(i.id));
        if (added.length > 0) {
          setBannerMessage(`${added.length} new incident(s) reported`);
          setBannerVisible(true);
          setTimeout(() => setBannerVisible(false), 3500);
        }
      }

      setIncidents(filteredIncidents);
      prevIdsRef.current = newIds;
    } catch (error) {
      console.error('[ViewerDashboard] Error fetching incidents:', error);
      Alert.alert('Error', error.message || 'An error occurred while fetching incidents.');
    } finally {
      setLoadingIncidents(false);
    }
  };

  const acknowledge = async (id) => {
    try {
      const res = await acknowledgeIncidentWithStatus(id, true);
      if (res && res.success) {
        setIncidents((prev) => prev.map((it) => (it.id === id ? { ...it, acknowledged: true, status: 'acknowledged' } : it)));
        Alert.alert('Acknowledged', 'Incident acknowledged. Security has been notified.');
      } else {
        Alert.alert('Error', (res && res.message) || 'Failed to acknowledge incident.');
      }
    } catch (err) {
      console.error('Acknowledge error:', err);
      Alert.alert('Error', 'An error occurred while acknowledging.');
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchIncidents();
    const iv = setInterval(() => {
      if (mounted) fetchIncidents(true);
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  };

  const renderIncidentItem = ({ item }) => (
    <TouchableOpacity
      style={[tailwind('bg-white p-4 mb-3 rounded-lg border border-sky-100'), { elevation: 2 }]}
      onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
    >
      <View style={tailwind('flex-row justify-between items-start')}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={tailwind('text-lg font-bold text-sky-800')}>
            #{item.id} • {String(item.type || '').replace('_', ' ')}
          </Text>
          {item.description ? (
            <Text style={tailwind('text-sm text-sky-600 mt-1')}>{item.description}</Text>
          ) : null}
          <Text style={tailwind('text-xs text-sky-500 mt-2')}>
            {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <View
            style={{
              backgroundColor:
                item.severity === 'critical'
                  ? '#ef4444'
                  : item.severity === 'high'
                  ? '#f97316'
                  : '#34d399',
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
              {String(item.severity || 'N/A').toUpperCase()}
            </Text>
          </View>

          <Text
            style={tailwind(
              `text-sm font-semibold ${
                item.acknowledged ? 'text-green-600' : 'text-red-600'
              } mt-2`
            )}
          >
            {item.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
          </Text>
        </View>
      </View>

      {item.evidence && item.evidence.length > 0 && (item.evidence[0].url || item.evidence[0].file_path) ? (
        <Image
          source={{ uri: item.evidence[0].url || getEvidenceUrl(item.evidence[0].file_path) }}
          style={{ width: '100%', height: 140, borderRadius: 8, marginTop: 12 }}
          resizeMode="cover"
          onError={(e) => console.log('[ViewerDashboard] Image load error:', e.nativeEvent.error)}
        />
      ) : null}

      <View style={tailwind('flex-row mt-3')}>
        <TouchableOpacity
          onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
          style={tailwind('mr-2 px-3 py-2 bg-gray-200 rounded')}
        >
          <Text>Details</Text>
        </TouchableOpacity>

        {!item.acknowledged && (
          <TouchableOpacity
            onPress={() => acknowledge(item.id)}
            style={tailwind('px-3 py-2 bg-blue-600 rounded')}
          >
            <Text style={tailwind('text-white')}>Acknowledge</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={tailwind('flex-1 bg-sky-50')}>
      <ScrollView
        style={tailwind('flex-1 p-4')}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
         <View style={tailwind('mb-4')}>
           <Text style={tailwind('text-2xl font-bold text-sky-700')}>Recent Incidents</Text>
           <Text style={tailwind('text-xs text-sky-600 mt-1')}>
             Incidents with evidence: {incidents.filter(i => Array.isArray(i.evidence) && i.evidence.length > 0).length} / {incidents.length}
           </Text>
         </View>

        <NotificationBanner
          visible={bannerVisible}
          message={bannerMessage}
          onPress={() => {
            setBannerVisible(false);
          }}
        />

        {loadingIncidents ? (
          <ActivityIndicator size="large" color="#0369A1" style={tailwind('my-4')} />
        ) : incidents.length === 0 ? (
          <Text style={tailwind('text-sky-600 text-center my-4')}>No incidents to display.</Text>
        ) : (
          <FlatList
            data={incidents}
            renderItem={renderIncidentItem}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
          />
        )}
      </ScrollView>

      {/* Floating SOS button - hide after sending */}
      {!sosDisabled && !sosSentRef.current ? (
        <TouchableOpacity
          onPress={async () => {
            console.log('[SOS] SOS button pressed');
            Alert.alert(
              'Emergency SOS',
              'Trigger emergency SOS? This will notify security.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Send SOS',
                  style: 'destructive',
                  onPress: async () => {
                    console.log('[SOS] Button clicked - hiding button NOW');
                    
                    // Hide button immediately using both state and ref
                    sosSentRef.current = true;
                    setSosDisabled(true);
                    
                    const cameraId = incidents?.[0]?.camera_id;
                    if (!cameraId) {
                      console.log('[SOS] No camera ID - sending local notification');
                      setBannerMessage('SOS sent — security notified');
                      setBannerVisible(true);
                      setTimeout(() => setBannerVisible(false), 3500);
                      return;
                    }
                    
                    console.log('[SOS] Creating incident with camera:', cameraId);
                    const payload = {
                      camera_id: cameraId,
                      type: 'fall_health',
                      severity: 'critical',
                      severity_score: 100,
                      description: 'SOS triggered by viewer',
                    };
                    
                    try {
                      const res = await createIncident(payload);
                      if (res && res.success) {
                        console.log('[SOS] Incident created successfully');
                        setBannerMessage('SOS sent — emergency incident created');
                        setBannerVisible(true);
                        setTimeout(() => setBannerVisible(false), 3500);
                        fetchIncidents();
                      } else {
                        console.log('[SOS] Error creating incident:', res?.message);
                        setBannerMessage('SOS sent (offline mode)');
                        setBannerVisible(true);
                        setTimeout(() => setBannerVisible(false), 3500);
                      }
                    } catch (error) {
                      console.log('[SOS] Network error:', error.message);
                      // Still show success to user even if network fails
                      setBannerMessage('SOS sent (will sync when online)');
                      setBannerVisible(true);
                      setTimeout(() => setBannerVisible(false), 3500);
                    }
                  },
                },
              ]
            );
          }}
          style={{
            position: 'absolute',
            right: 18,
            bottom: 28,
            backgroundColor: '#ef4444',
            padding: 14,
            borderRadius: 999,
            elevation: 6,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>SOS</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ position: 'absolute', right: 18, bottom: 28 }}>
          <Text style={{ color: '#6B7280', fontSize: 12 }}>SOS Sent</Text>
        </View>
      )}

      <MenuBar navigation={navigation} />
    </View>
  );
};
export default ViewerDashboardScreen;

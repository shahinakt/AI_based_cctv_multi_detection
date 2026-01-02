// screens/ViewerDashboardClean.jsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, acknowledgeIncidentWithStatus } from '../services/api';
import BottomNavigation from '../components/BottomNavigation';

const ViewerDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const prevIdsRef = useRef(new Set());

  const fetchIncidents = async (silent = false) => {
    if (!silent) setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      if (response && response.success) {
        const newList = response.data || [];
        const newIds = new Set(newList.map((i) => i.id));

        if (silent) {
          const prev = prevIdsRef.current;
          const added = newList.filter((i) => !prev.has(i.id));
          if (added.length > 0) {
            setBannerVisible(true);
            setTimeout(() => setBannerVisible(false), 3000);
          }
        }

        setIncidents(newList);
        prevIdsRef.current = newIds;
      } else {
        Alert.alert('Error', (response && response.message) || 'Failed to fetch incidents.');
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoadingIncidents(false);
    }
  };

  const acknowledge = async (id) => {
    try {
      const res = await acknowledgeIncidentWithStatus(id, true);
      if (res && res.success) {
        setIncidents((prev) => 
          prev.map((it) => (it.id === id ? { ...it, acknowledged: true, status: 'acknowledged' } : it))
        );
        Alert.alert('Success', 'Incident acknowledged. Security has been notified.');
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

  const renderIncidentItem = ({ item }) => {
    const cameraName = item.camera?.name || item.camera_name || 'Unknown';
    const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;

    return (
      <TouchableOpacity
        style={tailwind('bg-white p-4 mb-3 rounded-lg shadow')}
        onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
      >
        <View style={tailwind('flex-row justify-between items-start')}>
          <View style={tailwind('flex-1')}>
            <Text style={tailwind('text-lg font-bold text-gray-800')}>Incident #{item.id}</Text>
            <Text style={tailwind('text-sm text-gray-600')}>📹 Camera: {cameraName}</Text>
            <Text style={tailwind('text-sm text-gray-500')}>
              🕒 {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
          
          <View style={tailwind('items-end')}>
            <View style={[tailwind('px-2 py-1 rounded'), { backgroundColor: acknowledged ? '#10B981' : '#EF4444' }]}>
              <Text style={tailwind('text-white font-semibold')}>
                {acknowledged ? '✓ Acknowledged' : '! New'}
              </Text>
            </View>
          </View>
        </View>

        {!acknowledged && (
          <TouchableOpacity
            style={[tailwind('py-3 rounded mt-3'), { backgroundColor: '#3B82F6' }]}
            onPress={() => acknowledge(item.id)}
          >
            <Text style={tailwind('text-white text-center font-bold')}>
              ✓ Acknowledge Incident
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const newIncidentsCount = incidents.filter(i => !(i.status === 'acknowledged' || i.acknowledged)).length;

  return (
    <View style={tailwind('flex-1 bg-gray-100')}>
      {/* Header */}
      <View style={[tailwind('bg-green-600 p-4'), { paddingTop: 40 }]}>
        <Text style={tailwind('text-white text-2xl font-bold')}>Viewer Dashboard</Text>
        <Text style={tailwind('text-green-100')}>
          {newIncidentsCount} new incident{newIncidentsCount !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* New incidents banner */}
      {bannerVisible && (
        <View style={[tailwind('p-3'), { backgroundColor: '#FEF3C7' }]}>
          <Text style={tailwind('text-yellow-800 text-center font-bold')}>
            🔔 New incidents detected!
          </Text>
        </View>
      )}

      <ScrollView
        style={tailwind('flex-1')}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={tailwind('p-4')}>
          {loadingIncidents ? (
            <ActivityIndicator size="large" color="#10B981" style={tailwind('my-8')} />
          ) : incidents.length === 0 ? (
            <View style={tailwind('bg-white p-8 rounded-lg items-center')}>
              <Text style={tailwind('text-gray-500 text-center text-lg')}>✓ No incidents</Text>
              <Text style={tailwind('text-gray-400 text-center')}>Everything is secure!</Text>
            </View>
          ) : (
            <FlatList
              data={incidents}
              renderItem={renderIncidentItem}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavigation navigation={navigation} activeRoute="ViewerDashboard" role="viewer" />
    </View>
  );
};

export default ViewerDashboardScreen;

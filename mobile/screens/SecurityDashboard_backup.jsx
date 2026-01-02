// screens/SecurityDashboard.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, acknowledgeIncident } from '../services/api';
import BottomNavigation from '../components/BottomNavigation';

const SecurityDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const fetchIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      if (response.success) {
        // Filter only incidents assigned to security or unassigned
        setIncidents(response.data);
      } else {
        Alert.alert('Error', response.message || 'Failed to fetch incidents.');
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoadingIncidents(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    // Auto-refresh every 15 seconds
    const interval = setInterval(() => fetchIncidents(), 15000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  };

  const acknowledge = async (incidentId) => {
    try {
      setActionLoading(prev => ({ ...prev, [incidentId]: true }));
      const res = await acknowledgeIncident(incidentId);
      if (res.success) {
        await fetchIncidents();
        Alert.alert('Success', 'Incident marked as handled');
      } else {
        Alert.alert('Error', res.message || 'Failed to acknowledge incident');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to acknowledge incident');
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const renderIncidentItem = ({ item }) => {
    const ownerName = item.owner?.name || item.owner_name || 'Unknown';
    const cameraName = item.camera?.name || item.camera_name || 'Unknown';
    const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;
    const severity = item.severity || 'medium';

    const severityColor = severity === 'high' ? '#EF4444' : severity === 'medium' ? '#F59E0B' : '#10B981';

    return (
      <TouchableOpacity
        style={tailwind('bg-white p-4 mb-3 rounded-lg shadow')}
        onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
      >
        <View style={tailwind('flex-row justify-between items-start mb-2')}>
          <View style={tailwind('flex-1')}>
            <Text style={tailwind('text-lg font-bold text-gray-800')}>Incident #{item.id}</Text>
            <Text style={tailwind('text-sm text-gray-600')}>📍 {cameraName}</Text>
            <Text style={tailwind('text-sm text-gray-600')}>👤 Reported by: {ownerName}</Text>
            <Text style={tailwind('text-sm text-gray-500')}>
              🕒 {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
          
          <View style={tailwind('items-end')}>
            <View style={[tailwind('px-2 py-1 rounded mb-2'), { backgroundColor: severityColor }]}>
              <Text style={tailwind('text-white font-semibold')}>
                {severity.toUpperCase()}
              </Text>
            </View>
            <View style={[tailwind('px-2 py-1 rounded'), { backgroundColor: acknowledged ? '#10B981' : '#EF4444' }]}>
              <Text style={tailwind('text-white font-semibold')}>
                {acknowledged ? '✓ Handled' : '! Pending'}
              </Text>
            </View>
          </View>
        </View>

        {!acknowledged && (
          <TouchableOpacity
            style={[tailwind('py-3 rounded mt-2'), { backgroundColor: '#3B82F6' }]}
            onPress={() => acknowledge(item.id)}
            disabled={!!actionLoading[item.id]}
          >
            {actionLoading[item.id] ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={tailwind('text-white text-center font-bold')}>
                ✓ Mark as Handled
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const unhandledCount = incidents.filter(i => !(i.status === 'acknowledged' || i.acknowledged)).length;

  return (
    <View style={tailwind('flex-1 bg-gray-100')}>
      {/* Header */}
      <View style={[tailwind('bg-indigo-600 p-4'), { paddingTop: 40 }]}>
        <Text style={tailwind('text-white text-2xl font-bold')}>Security Dashboard</Text>
        <Text style={tailwind('text-indigo-100')}>
          {unhandledCount} pending incident{unhandledCount !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView
        style={tailwind('flex-1')}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={tailwind('p-4')}>
          {loadingIncidents ? (
            <ActivityIndicator size="large" color="#6366F1" style={tailwind('my-8')} />
          ) : incidents.length === 0 ? (
            <View style={tailwind('bg-white p-8 rounded-lg items-center')}>
              <Text style={tailwind('text-gray-500 text-center text-lg')}>✓ No incidents</Text>
              <Text style={tailwind('text-gray-400 text-center')}>All clear!</Text>
            </View>
          ) : (
            <>
              {unhandledCount > 0 && (
                <View style={[tailwind('p-4 rounded-lg mb-4'), { backgroundColor: '#FEF3C7' }]}>
                  <Text style={tailwind('text-yellow-800 font-bold')}>
                    ⚠️ {unhandledCount} incident{unhandledCount !== 1 ? 's' : ''} require{unhandledCount === 1 ? 's' : ''} attention
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

      {/* Bottom Navigation */}
      <BottomNavigation navigation={navigation} activeRoute="SecurityDashboard" role="security" />
    </View>
  );
};

export default SecurityDashboardScreen;

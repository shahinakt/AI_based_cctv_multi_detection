// screens/SecurityDashboard.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  const acknowledgedIncidentsRef = useRef(new Set());

  const fetchIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      if (response.success) {
        console.log('[SecurityDashboard] Fetched incidents from backend, count:', response.data.length);
        console.log('[SecurityDashboard] Acknowledged incidents ref:', Array.from(acknowledgedIncidentsRef.current));
        
        // Merge with locally acknowledged incidents to prevent overwriting
        const updatedData = response.data.map(incident => {
          if (acknowledgedIncidentsRef.current.has(incident.id)) {
            console.log('[SecurityDashboard] Preserving acknowledged status for incident:', incident.id);
            return { ...incident, acknowledged: true, status: 'acknowledged' };
          }
          // Also check if backend says it's acknowledged
          if (incident.acknowledged === true || incident.status === 'acknowledged') {
            console.log('[SecurityDashboard] Backend says incident is acknowledged:', incident.id);
            acknowledgedIncidentsRef.current.add(incident.id);
          }
          return incident;
        });
        
        console.log('[SecurityDashboard] Setting incidents with preserved acknowledged status');
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
      console.log('[SecurityDashboard] STARTING acknowledge for incident:', incidentId);
      setActionLoading(prev => ({ ...prev, [incidentId]: true }));
      
      // Immediately update UI before API call
      setIncidents(prev => {
        const updated = prev.map(inc => 
          inc.id === incidentId 
            ? { ...inc, acknowledged: true, status: 'acknowledged' } 
            : inc
        );
        console.log('[SecurityDashboard] Immediate UI update:', updated.find(i => i.id === incidentId));
        return updated;
      });
      
      // Track this incident as acknowledged immediately
      acknowledgedIncidentsRef.current.add(incidentId);
      
      const res = await acknowledgeIncident(incidentId);
      console.log('[SecurityDashboard] Acknowledge API response:', res);
      
      if (res.success) {
        // Success alert
        Alert.alert(
          'Success', 
          'Incident marked as handled. Admin and incident reporter have been notified.',
          [{ text: 'OK' }]
        );
      } else {
        // Revert on failure
        setIncidents(prev => prev.map(inc => 
          inc.id === incidentId 
            ? { ...inc, acknowledged: false, status: 'pending' } 
            : inc
        ));
        acknowledgedIncidentsRef.current.delete(incidentId);
        Alert.alert('Error', res.message || 'Failed to acknowledge incident');
      }
    } catch (e) {
      console.error('[SecurityDashboard] Acknowledge error:', e);
      // Revert on error
      setIncidents(prev => prev.map(inc => 
        inc.id === incidentId 
          ? { ...inc, acknowledged: false, status: 'pending' } 
          : inc
      ));
      acknowledgedIncidentsRef.current.delete(incidentId);
      Alert.alert('Error', 'Failed to acknowledge incident');
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
      console.log('[SecurityDashboard] FINISHED acknowledge for incident:', incidentId);
    }
  };

  const renderIncidentItem = ({ item }) => {
    const ownerName = item.camera?.admin_user?.username || item.assigned_user?.username || 'Unknown';
    const cameraName = item.camera?.name || 'Unknown Camera';
    const location = item.camera?.location || 'Unknown Location';
    const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;
    const severity = item.severity || 'medium';

    const severityColor = severity === 'high' ? '#EF4444' : severity === 'medium' ? '#F59E0B' : '#10B981';

    return (
      <View
        style={[tailwind('bg-white p-4 mb-3'), { borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 }]}
      >
        <TouchableOpacity 
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}
          onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
        >
          <View style={tailwind('flex-1')}>
            <Text style={tailwind('text-lg font-bold text-gray-800')}>Incident #{item.id}</Text>
            <Text style={tailwind('text-sm text-gray-600')}>Camera: {cameraName}</Text>
            <Text style={tailwind('text-sm text-gray-600')}>Location: {location}</Text>
            <Text style={tailwind('text-sm text-gray-600')}>Owner: {ownerName}</Text>
            <Text style={tailwind('text-sm text-gray-500')}>
              Time: {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
          
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 8, backgroundColor: severityColor }}>
              <Text style={tailwind('text-white font-semibold')}>
                {severity.toUpperCase()}
              </Text>
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: acknowledged ? '#10B981' : '#EF4444' }}>
              <Text style={tailwind('text-white font-semibold')}>
                {acknowledged ? 'Handled' : 'Pending'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ paddingVertical: 12, borderRadius: 4, marginTop: 8, backgroundColor: acknowledged ? '#10B981' : '#3B82F6' }}
          onPress={() => {
            console.log('[SecurityDashboard] Button clicked for incident:', item.id, 'acknowledged:', acknowledged);
            if (!acknowledged) {
              acknowledge(item.id);
            } else {
              console.log('[SecurityDashboard] Incident already acknowledged, ignoring click');
            }
          }}
          disabled={acknowledged || !!actionLoading[item.id]}
        >
          {actionLoading[item.id] ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={tailwind('text-white text-center font-bold')}>
              {acknowledged ? 'Marked' : 'Mark as Handled'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // Calculate unhandled count using useMemo to recalculate when incidents change
  const unhandledCount = useMemo(() => {
    const count = incidents.filter(i => !(i.status === 'acknowledged' || i.acknowledged === true)).length;
    return count;
  }, [incidents]);

  return (
    <View style={tailwind('flex-1 bg-gray-100')}>
      {/* Header */}
      <View style={[tailwind('bg-indigo-600 p-6'), { paddingTop: 50, alignItems: 'center' }]}>
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
            <View style={[tailwind('bg-white p-8'), { borderRadius: 8, alignItems: 'center' }]}>
              <Text style={tailwind('text-gray-500 text-center text-lg')}>No incidents</Text>
              <Text style={tailwind('text-gray-400 text-center')}>All clear</Text>
            </View>
          ) : (
            <>
              {unhandledCount > 0 && (
                <View style={{ padding: 16, borderRadius: 8, marginBottom: 16, backgroundColor: '#FEF3C7' }}>
                  <Text style={tailwind('text-yellow-800 font-bold')}>
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

      {/* Bottom Navigation */}
      <BottomNavigation navigation={navigation} activeRoute="SecurityDashboard" role="security" />
    </View>
  );
};

export default SecurityDashboardScreen;

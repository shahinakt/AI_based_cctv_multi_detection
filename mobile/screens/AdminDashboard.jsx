// screens/AdminDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, acknowledgeIncident, grantAccessToIncident } from '../services/api';
import BottomNavigation from '../components/BottomNavigation';

const AdminDashboardScreen = ({ navigation }) => {
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
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  };

  const acknowledge = async (incidentId) => {
    try {
      setActionLoading(prev => ({ ...prev, [incidentId]: true }));
      
      // Optimistic update - update UI immediately
      setIncidents(prevIncidents => 
        prevIncidents.map(inc => 
          inc.id === incidentId 
            ? { ...inc, acknowledged: true, status: 'acknowledged' }
            : inc
        )
      );
      
      // Make API call in background
      const res = await acknowledgeIncident(incidentId);
      
      if (res.success) {
        // Success - UI already updated
        Alert.alert('Success', 'Incident acknowledged');
      } else {
        // Rollback on error
        setIncidents(prevIncidents => 
          prevIncidents.map(inc => 
            inc.id === incidentId 
              ? { ...inc, acknowledged: false, status: 'pending' }
              : inc
          )
        );
        Alert.alert('Error', res.message || 'Failed to acknowledge incident');
      }
    } catch (e) {
      console.error('Acknowledge error:', e);
      // Rollback on error
      setIncidents(prevIncidents => 
        prevIncidents.map(inc => 
          inc.id === incidentId 
            ? { ...inc, acknowledged: false, status: 'pending' }
            : inc
        )
      );
      Alert.alert('Error', 'Failed to acknowledge incident: ' + (e.message || 'Unknown error'));
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const grantAccess = useCallback((incidentId) => {
    navigation.navigate('GrantAccess', { incidentId });
  }, [navigation]);

  // Memoize stats to avoid recalculation on every render
  const stats = useMemo(() => {
    const total = incidents.length;
    const pending = incidents.filter(i => i.status !== 'acknowledged' && i.acknowledged !== true).length;
    const acknowledged = incidents.filter(i => i.status === 'acknowledged' || i.acknowledged === true).length;
    return { total, pending, acknowledged };
  }, [incidents]);

  const renderIncidentItem = useCallback(({ item }) => {
    const assignedUserName = item.assigned_user?.username || 'Unassigned';
    const cameraInfo = item.camera?.admin_user?.username || item.camera?.name || 'Unknown';
    const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;

    return (
      <View
        style={[tailwind('bg-white mb-3 rounded-2xl overflow-hidden'), { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }]}
      >
        {/* Clickable card area */}
        <TouchableOpacity
          onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
          activeOpacity={0.7}
        >
          {/* Header with Status Badge */}
          <View style={tailwind('flex-row justify-between items-center px-4 pt-4 pb-2')}>
            <Text style={tailwind('text-base font-bold text-gray-900')}>#{item.id}</Text>
            <View style={[tailwind('px-3 py-1 rounded-full'), { backgroundColor: acknowledged ? '#ECFDF5' : '#FEF2F2', marginLeft: 12 }]}>
              <Text style={[tailwind('text-xs font-semibold'), { color: acknowledged ? '#10B981' : '#EF4444', letterSpacing: 0.3 }]}>
                {acknowledged ? '✓  Acknowledged' : '!  Pending'}
              </Text>
            </View>
          </View>

          {/* Incident Details */}
          <View style={tailwind('px-4 pb-3')}>
            <View style={tailwind('flex-row items-center mb-1')}>
              <Text style={tailwind('text-xs text-gray-400 mr-2')}>�</Text>
              <Text style={tailwind('text-sm text-gray-700')}>{cameraInfo}</Text>
            </View>
            <View style={tailwind('flex-row items-center mb-1')}>
              <Text style={tailwind('text-xs text-gray-400 mr-2')}>�</Text>
              <Text style={tailwind('text-sm text-gray-700')}>{assignedUserName}</Text>
            </View>
            <View style={tailwind('flex-row items-center')}>
              <Text style={tailwind('text-xs text-gray-400 mr-2')}>🕐</Text>
              <Text style={tailwind('text-xs text-gray-500')}>
                {new Date(item.timestamp).toLocaleString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Action Buttons - Separate from card press */}
        <View style={tailwind('flex-row border-t border-gray-100')}>
          {!acknowledged && (
            <TouchableOpacity
              style={tailwind('flex-1 py-3 items-center justify-center border-r border-gray-100')}
              onPress={(e) => {
                acknowledge(item.id);
              }}
              disabled={!!actionLoading[item.id]}
              activeOpacity={0.6}
            >
              {actionLoading[item.id] ? (
                <ActivityIndicator color="#6366F1" size="small" />
              ) : (
                <Text style={[tailwind('text-sm font-semibold'), { color: '#6366F1' }]}>
                  Acknowledge
                </Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[tailwind('py-3 items-center justify-center'), !acknowledged ? tailwind('flex-1') : tailwind('flex-1')]}
            onPress={(e) => {
              grantAccess(item.id);
            }}
            activeOpacity={0.6}
          >
            <Text style={[tailwind('text-sm font-semibold'), { color: '#8B5CF6' }]}>Assign →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [actionLoading, navigation]);

  const keyExtractor = useCallback((item) => `incident-${item.id}`, []);

  const ListHeaderComponent = useCallback(() => (
    <View style={tailwind('px-5 pt-5')}>
      {/* Stats Card */}
      <View style={[tailwind('bg-white rounded-2xl p-6 mb-6'), { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
        {/* Total */}
        <View style={tailwind('items-center mb-5')}>
          <Text style={tailwind('text-xs text-gray-400 font-semibold mb-2 tracking-wide')}>TOTAL INCIDENTS</Text>
          <Text style={[tailwind('text-5xl font-bold'), { color: '#6366F1' }]}>{stats.total}</Text>
        </View>
        
        {/* Pending & Acknowledged */}
        <View style={tailwind('flex-row')}>
          <View style={tailwind('flex-1 items-center py-3 border-r border-gray-100')}>
            <Text style={tailwind('text-xs text-gray-400 mb-1')}>Pending</Text>
            <Text style={[tailwind('text-2xl font-bold'), { color: '#EF4444' }]}>{stats.pending}</Text>
          </View>
          <View style={tailwind('flex-1 items-center py-3')}>
            <Text style={tailwind('text-xs text-gray-400 mb-1')}>Acknowledged</Text>
            <Text style={[tailwind('text-2xl font-bold'), { color: '#10B981' }]}>{stats.acknowledged}</Text>
          </View>
        </View>
      </View>

      <Text style={tailwind('text-xs text-gray-400 font-semibold mb-3 px-1')}>
        RECENT ACTIVITY
      </Text>
    </View>
  ), [stats, tailwind]);

  const ListEmptyComponent = useCallback(() => (
    <View style={[tailwind('bg-white rounded-2xl p-12 items-center mx-5'), { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
      <Text style={tailwind('text-5xl mb-3')}>✓</Text>
      <Text style={tailwind('text-gray-900 text-base font-semibold mb-1')}>All Clear</Text>
      <Text style={tailwind('text-gray-400 text-sm text-center')}>No incidents to display</Text>
    </View>
  ), [tailwind]);

  return (
    <View style={[tailwind('flex-1'), { backgroundColor: '#F9FAFB' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      
      {/* Clean Minimal Header */}
      <View style={[tailwind('items-center'), { paddingTop: 50, paddingBottom: 24 }]}>
        <Text style={[tailwind('text-3xl font-bold mb-2'), { color: '#111827', letterSpacing: -0.5 }]}>
          DASHBOARD
        </Text>
        <Text style={tailwind('text-sm text-gray-400')}>
          Manage incidents & security
        </Text>
      </View>

      {loadingIncidents ? (
        <View style={[tailwind('flex-1 justify-center items-center'), { backgroundColor: '#F9FAFB' }]}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={tailwind('text-gray-400 text-sm mt-3')}>Loading incidents...</Text>
        </View>
      ) : (
        <FlatList
          data={incidents}
          renderItem={renderIncidentItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={ListEmptyComponent}
          onRefresh={onRefresh}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 20 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={10}
          windowSize={10}
          getItemLayout={(data, index) => ({
            length: 180,
            offset: 180 * index,
            index,
          })}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNavigation navigation={navigation} activeRoute="AdminDashboard" role="admin" />
    </View>
  );
};

export default AdminDashboardScreen;
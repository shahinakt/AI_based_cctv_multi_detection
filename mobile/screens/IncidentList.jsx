// screens/IncidentList.jsx
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import useIncidents from '../hooks/useIncidents';

const IncidentListScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const { incidents, loading, error, refreshIncidents, refreshing } = useIncidents();

  const renderIncidentItem = ({ item }) => (
    <TouchableOpacity
      style={tailwind('bg-white p-4 mb-3 rounded-lg shadow-md')}
      onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
    >
      <Text style={tailwind('text-lg font-bold text-gray-800')}>Incident ID: {item.id}</Text>
      <Text style={tailwind('text-base text-gray-700')}>Type: {item.type}</Text>
      <Text style={tailwind('text-sm text-gray-500')}>Time: {new Date(item.timestamp).toLocaleString()}</Text>
      <Text style={tailwind(`text-sm font-semibold ${item.status === 'acknowledged' ? 'text-green-600' : 'text-red-600'}`)}>
        Status: {item.status}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={tailwind('flex-1 justify-center items-center bg-gray-100')}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={tailwind('mt-4 text-gray-600')}>Loading incidents...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={tailwind('flex-1 justify-center items-center bg-gray-100')}>
        <Text style={tailwind('text-red-500 text-lg')}>Error: {error}</Text>
        <TouchableOpacity onPress={refreshIncidents} style={tailwind('mt-4 bg-blue-500 py-2 px-4 rounded-lg')}>
          <Text style={tailwind('text-white')}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={tailwind('flex-1 bg-gray-100 p-4')}>
      <Text style={tailwind('text-2xl font-bold mb-4 text-gray-800')}>All Incidents</Text>
      {incidents.length === 0 ? (
        <Text style={tailwind('text-gray-600 text-center my-4')}>No incidents to display.</Text>
      ) : (
        <FlatList
          data={incidents}
          renderItem={renderIncidentItem}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshIncidents} />
          }
        />
      )}
    </View>
  );
};

export default IncidentListScreen;
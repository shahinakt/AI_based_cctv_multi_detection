// screens/IncidentDetail.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import AcknowledgeButton from '../components/AcknowledgeButton';
import { Video } from 'expo-av'; // For HLS/MP4 streams
import { WebView } from 'react-native-webview'; // For MJPEG streams
import { getIncidentDetails } from '../services/api'; // Assuming an API to get more details if needed

const IncidentDetailScreen = ({ route, navigation }) => {
  const tailwind = useTailwind();
  const { incident: initialIncident } = route.params;
  const [incident, setIncident] = useState(initialIncident);
  const [loading, setLoading] = useState(false);

  // Function to refresh incident details after acknowledgment
  const handleAcknowledgeSuccess = async () => {
    setLoading(true);
    try {
      // In a real app, you'd refetch the incident details from the API
      // For now, we'll just update the status locally
      setIncident(prev => ({ ...prev, status: 'acknowledged' }));
      Alert.alert('Update', 'Incident status updated locally.');
      // If there's a list of incidents on the previous screen, you might want to refresh it
      // navigation.goBack(); // Or pass a callback to refresh the list
    } catch (error) {
      console.error('Error refreshing incident after acknowledge:', error);
      Alert.alert('Error', 'Could not refresh incident details.');
    } finally {
      setLoading(false);
    }
  };

  const renderEvidence = (evidence) => {
    if (!evidence || evidence.length === 0) {
      return <Text style={tailwind('text-gray-600 text-center mt-4')}>No evidence available.</Text>;
    }

    return evidence.map((item, index) => {
      const isImage = item.url.match(/\.(jpeg|jpg|gif|png)$/i);
      const isVideo = item.url.match(/\.(mp4|mov|avi|mkv|m3u8)$/i); // Added m3u8 for HLS

      return (
        <View key={index} style={tailwind('mb-4 bg-gray-200 rounded-lg overflow-hidden')}>
          <Text style={tailwind('p-2 font-semibold text-gray-800')}>Evidence {index + 1}</Text>
          {isImage && (
            <Image
              source={{ uri: item.url }}
              style={tailwind('w-full h-64 resize-contain')}
              resizeMode="contain"
              onError={(e) => console.log('Image load error:', e.nativeEvent.error)}
            />
          )}
          {isVideo && (
            <Video
              source={{ uri: item.url }}
              rate={1.0}
              volume={1.0}
              isMuted={false}
              resizeMode="contain"
              shouldPlay={false} // Don't autoplay, let user control
              isLooping={false}
              useNativeControls
              style={tailwind('w-full h-64')}
              onError={(e) => console.log('Video load error:', e)}
            />
          )}
          {!isImage && !isVideo && (
            <View style={tailwind('p-4')}>
              <Text style={tailwind('text-gray-700')}>Unsupported evidence type or URL: {item.url}</Text>
            </View>
          )}
          <Text style={tailwind('p-2 text-sm text-gray-600')}>Hash: {item.hash}</Text>
        </View>
      );
    });
  };

  return (
    <ScrollView style={tailwind('flex-1 bg-gray-100 p-4')}>
      <Text style={tailwind('text-3xl font-bold mb-6 text-gray-800')}>Incident Details</Text>

      <View style={tailwind('bg-white p-6 rounded-lg shadow-md mb-6')}>
        <Text style={tailwind('text-xl font-bold mb-2 text-gray-800')}>Incident ID: {incident.id}</Text>
        <Text style={tailwind('text-lg text-gray-700 mb-1')}>Type: {incident.type}</Text>
        <Text style={tailwind('text-md text-gray-600 mb-1')}>Timestamp: {new Date(incident.timestamp).toLocaleString()}</Text>
        <Text style={tailwind('text-md text-gray-600 mb-1')}>Location: {incident.location || 'N/A'}</Text>
        <Text style={tailwind(`text-lg font-semibold ${incident.status === 'acknowledged' ? 'text-green-600' : 'text-red-600'} mt-2`)}>
          Status: {incident.status}
        </Text>
      </View>

      <Text style={tailwind('text-2xl font-bold mb-4 text-gray-800')}>Evidence</Text>
      {renderEvidence(incident.evidence)}

      {incident.status !== 'acknowledged' && (
        <View style={tailwind('mt-8 mb-4')}>
          <AcknowledgeButton incidentId={incident.id} onAcknowledgeSuccess={handleAcknowledgeSuccess} />
        </View>
      )}

      {loading && (
        <View style={tailwind('absolute inset-0 bg-black bg-opacity-50 justify-center items-center')}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={tailwind('text-white mt-2')}>Updating incident...</Text>
        </View>
      )}
    </ScrollView>
  );
};

export default IncidentDetailScreen;
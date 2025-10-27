// screens/SecurityDashboard.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, getCameraFeeds } from '../services/api';
import { Video } from 'expo-av'; // For HLS/MP4 streams
import { WebView } from 'react-native-webview'; // For MJPEG streams

const SecurityDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [cameraFeeds, setCameraFeeds] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [loadingFeeds, setLoadingFeeds] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      Alert.alert('Error', 'An error occurred while fetching incidents.');
    } finally {
      setLoadingIncidents(false);
    }
  };

  const fetchCameraFeeds = async () => {
    setLoadingFeeds(true);
    try {
      const response = await getCameraFeeds();
      if (response.success) {
        setCameraFeeds(response.data);
      } else {
        Alert.alert('Error', response.message || 'Failed to fetch camera feeds.');
      }
    } catch (error) {
      console.error('Error fetching camera feeds:', error);
      Alert.alert('Error', 'An error occurred while fetching camera feeds.');
    } finally {
      setLoadingFeeds(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    fetchCameraFeeds();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchIncidents(), fetchCameraFeeds()]);
    setRefreshing(false);
  };

  const renderCameraFeed = ({ item }) => {
    // Assuming item.streamUrl is either HLS (.m3u8) or MJPEG
    const isHLS = item.streamUrl.endsWith('.m3u8');
    const isMJPEG = item.streamUrl.startsWith('http') && !isHLS; // Simple check, might need refinement

    return (
      <View style={tailwind('w-full h-64 bg-gray-800 mb-4 rounded-lg overflow-hidden')}>
        <Text style={tailwind('text-white text-lg font-bold p-2 bg-gray-900')}>{item.name}</Text>
        {isHLS ? (
          <Video
            source={{ uri: item.streamUrl }}
            rate={1.0}
            volume={1.0}
            isMuted={true}
            resizeMode="cover"
            shouldPlay
            isLooping
            style={tailwind('flex-1')}
            useNativeControls={false}
          />
        ) : isMJPEG ? (
          <WebView
            source={{ uri: item.streamUrl }}
            style={tailwind('flex-1')}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => <ActivityIndicator style={tailwind('flex-1')} size="large" color="#fff" />}
          />
        ) : (
          <View style={tailwind('flex-1 justify-center items-center')}>
            <Text style={tailwind('text-white')}>Unsupported stream type</Text>
          </View>
        )}
      </View>
    );
  };

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

  return (
    <View style={tailwind('flex-1 bg-gray-100')}>
      <ScrollView
        style={tailwind('flex-1 p-4')}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={tailwind('text-2xl font-bold mb-4 text-gray-800')}>Live Camera Feeds</Text>
        {loadingFeeds ? (
          <ActivityIndicator size="large" color="#0000ff" style={tailwind('my-4')} />
        ) : cameraFeeds.length === 0 ? (
          <Text style={tailwind('text-gray-600 text-center my-4')}>No camera feeds available.</Text>
        ) : (
          <FlatList
            data={cameraFeeds}
            renderItem={renderCameraFeed}
            keyExtractor={(item) => item.id.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tailwind('pb-4')}
          />
        )}

        <Text style={tailwind('text-2xl font-bold mt-6 mb-4 text-gray-800')}>Recent Incidents</Text>
        {loadingIncidents ? (
          <ActivityIndicator size="large" color="#0000ff" style={tailwind('my-4')} />
        ) : incidents.length === 0 ? (
          <Text style={tailwind('text-gray-600 text-center my-4')}>No incidents to display.</Text>
        ) : (
          <FlatList
            data={incidents}
            renderItem={renderIncidentItem}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false} // Disable inner scroll for FlatList inside ScrollView
          />
        )}
      </ScrollView>
    </View>
  );
};

export default SecurityDashboardScreen;
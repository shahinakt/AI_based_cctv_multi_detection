import React, { useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Alert, Modal, TouchableOpacity, Share } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import AcknowledgeButton from '../components/AcknowledgeButton';
import MenuBar from '../components/MenuBar';
import { Video } from 'expo-av';
import { WebView } from 'react-native-webview';

const IncidentDetailScreen = ({ route, navigation }) => {
  const tailwind = useTailwind();
  const { incident: initialIncident } = route.params;
  const [incident, setIncident] = useState(initialIncident);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState(null);

  const handleAcknowledgeSuccess = async () => {
    setLoading(true);
    try {
      setIncident(prev => ({ ...prev, status: 'acknowledged', acknowledged: true }));
      Alert.alert('Updated', 'Incident marked acknowledged.');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not update incident.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      // navigator clipboard fallback
      await (navigator && navigator.clipboard && navigator.clipboard.writeText(text));
      Alert.alert('Copied', 'Transaction ID copied to clipboard');
    } catch (err) {
      console.warn('Clipboard write failed', err);
    }
  };

  const renderEvidence = (evidence = []) => {
    if (!evidence || evidence.length === 0) {
      return <Text style={tailwind('text-sky-600 text-center mt-4')}>No evidence available.</Text>;
    }

    return evidence.map((item, index) => {
      const isImage = !!item.url && item.url.match(/\.(jpeg|jpg|gif|png)$/i);
      const isVideo = !!item.url && item.url.match(/\.(mp4|mov|avi|mkv|m3u8)$/i);

      return (
        <View key={index} style={tailwind('mb-4 bg-white rounded-lg overflow-hidden border border-sky-100')}>
          <Text style={tailwind('p-2 font-semibold text-sky-800')}>Evidence {index + 1}</Text>
          {isImage && (
            <TouchableOpacity onPress={() => { setActiveEvidence(item); setModalVisible(true); }}>
              <Image source={{ uri: item.url }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
            </TouchableOpacity>
          )}

          {isVideo && (
            <Video
              source={{ uri: item.url }}
              rate={1.0}
              volume={1.0}
              isMuted={false}
              resizeMode="contain"
              shouldPlay={false}
              isLooping={false}
              useNativeControls
              style={{ width: '100%', height: 220 }}
            />
          )}

          {!isImage && !isVideo && (
            <View style={tailwind('p-4')}>
              <Text style={tailwind('text-sky-700')}>Unsupported evidence type or URL: {item.url}</Text>
            </View>
          )}

          <Text style={tailwind('p-2 text-sm text-sky-600')}>Hash: {item.hash}</Text>
        </View>
      );
    });
  };

  return (
    <ScrollView style={tailwind('flex-1 bg-sky-50 p-4')}>
      <Text style={tailwind('text-3xl font-bold mb-6 text-sky-800')}>Incident Details</Text>

      <View style={tailwind('bg-white p-6 rounded-lg shadow-md mb-6 border border-sky-100')}>
        <Text style={tailwind('text-xl font-bold mb-2 text-sky-800')}>Incident ID: {incident.id}</Text>
        <Text style={tailwind('text-lg text-sky-700 mb-1')}>Type: {incident.type}</Text>
        <Text style={tailwind('text-md text-sky-600 mb-1')}>Timestamp: {new Date(incident.timestamp).toLocaleString()}</Text>
        <Text style={tailwind('text-md text-sky-600 mb-1')}>Location: {incident.location || 'N/A'}</Text>
        <Text style={tailwind(`text-lg font-semibold ${incident.acknowledged ? 'text-green-600' : 'text-red-600'} mt-2`)}>
          Acknowledged: {incident.acknowledged ? 'Yes' : 'No'}
        </Text>

        {incident.blockchain_tx && (
          <View style={tailwind('mt-3 flex-row items-center justify-between')}> 
            <Text style={tailwind('text-sm text-sky-600')}>Blockchain TX: {incident.blockchain_tx.slice(0, 12)}...</Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={() => copyToClipboard(incident.blockchain_tx)} style={tailwind('px-3 py-1 rounded bg-sky-100 mr-2')}>
                <Text style={tailwind('text-sky-700')}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => { try { await Share.share({ message: incident.blockchain_tx }); } catch (e) {} }} style={tailwind('px-3 py-1 rounded bg-sky-100') }>
                <Text style={tailwind('text-sky-700')}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <Text style={tailwind('text-2xl font-bold mb-4 text-sky-800')}>Evidence</Text>
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

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setModalVisible(false)} style={{ position: 'absolute', top: 40, right: 20 }}>
            <Text style={{ color: '#fff', fontSize: 18 }}>Close</Text>
          </TouchableOpacity>
          {activeEvidence && (
            <Image source={{ uri: activeEvidence.url }} style={{ width: '92%', height: '80%' }} resizeMode="contain" />
          )}
        </View>
      </Modal>
      <MenuBar navigation={navigation} />
    </ScrollView>
  );
};

export default IncidentDetailScreen;
// screens/IncidentDetail.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Alert, Modal, TouchableOpacity, Share, Clipboard } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import AcknowledgeButton from '../components/AcknowledgeButton';
import MenuBar from '../components/MenuBar';
import { Video } from 'expo-av'; // For HLS/MP4 streams
import { WebView } from 'react-native-webview'; // For MJPEG streams
import { getIncidentDetails } from '../services/api'; // Assuming an API to get more details if needed

const IncidentDetailScreen = ({ route, navigation }) => {
  const tailwind = useTailwind();
  const { incident: initialIncident } = route.params;
  const [incident, setIncident] = useState(initialIncident);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState(null);

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
    return (
      <ScrollView style={tailwind('flex-1 bg-sky-50 p-4')}>
        <Text style={tailwind('text-3xl font-bold mb-6 text-sky-800')}>Incident Details</Text>

        <View style={tailwind('bg-white p-6 rounded-lg shadow-md mb-6 border border-sky-100')}>
          <Text style={tailwind('text-xl font-bold mb-2 text-sky-800')}>Incident ID: {incident.id}</Text>
          <Text style={tailwind('text-lg text-sky-700 mb-1')}>Type: {incident.type}</Text>
          <Text style={tailwind('text-md text-sky-600 mb-1')}>Timestamp: {new Date(incident.timestamp).toLocaleString()}</Text>
          <Text style={tailwind('text-md text-sky-600 mb-1')}>Location: {incident.location || 'N/A'}</Text>
          <Text style={tailwind(`text-lg font-semibold ${incident.acknowledged ? 'text-green-600' : 'text-red-600'} mt-2`)}>
            Acknowledged: {incident.acknowledged ? 'Yes' : 'No'}
          </Text>
          {incident.blockchain_tx && (
            <View style={tailwind('mt-3 flex-row items-center justify-between')}> 
              <Text style={tailwind('text-sm text-sky-600')}>Blockchain TX: {incident.blockchain_tx.slice(0, 12)}...</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => copyToClipboard(incident.blockchain_tx)} style={tailwind('px-3 py-1 rounded bg-sky-100 mr-2')}>
                  <Text style={tailwind('text-sky-700')}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => { 
                  try { await Share.share({ message: incident.blockchain_tx }); } catch(e){}
                } } style={tailwind('px-3 py-1 rounded bg-sky-100') }>
                  <Text style={tailwind('text-sky-700')}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <Text style={tailwind('text-2xl font-bold mb-4 text-sky-800')}>Evidence</Text>
        {renderEvidence(incident.evidence)}
              volume={1.0}
              isMuted={false}
              resizeMode="contain"
              shouldPlay={false} // Don't autoplay, let user control
              isLooping={false}
              useNativeControls
              style={{ width: '100%', height: 220 }}
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

  const copyToClipboard = async (text) => {
    try {
      await Clipboard.setString(text);
      Alert.alert('Copied', 'Transaction ID copied to clipboard');
    } catch (err) {
      console.error('Clipboard error:', err);
    }
  };

  return (
    <ScrollView style={tailwind('flex-1 bg-gray-100 p-4')}>
      <Text style={tailwind('text-3xl font-bold mb-6 text-gray-800')}>Incident Details</Text>

      <View style={tailwind('bg-white p-6 rounded-lg shadow-md mb-6')}>
        <Text style={tailwind('text-xl font-bold mb-2 text-gray-800')}>Incident ID: {incident.id}</Text>
        <Text style={tailwind('text-lg text-gray-700 mb-1')}>Type: {incident.type}</Text>
        <Text style={tailwind('text-md text-gray-600 mb-1')}>Timestamp: {new Date(incident.timestamp).toLocaleString()}</Text>
        <Text style={tailwind('text-md text-gray-600 mb-1')}>Location: {incident.location || 'N/A'}</Text>
        <Text style={tailwind(`text-lg font-semibold ${incident.acknowledged ? 'text-green-600' : 'text-red-600'} mt-2`)}>
          Acknowledged: {incident.acknowledged ? 'Yes' : 'No'}
        </Text>
        {incident.blockchain_tx && (
          <View style={tailwind('mt-3 flex-row items-center justify-between')}> 
            <Text style={tailwind('text-sm text-gray-600')}>Blockchain TX: {incident.blockchain_tx.slice(0, 12)}...</Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={() => copyToClipboard(incident.blockchain_tx)} style={tailwind('px-3 py-1 rounded bg-gray-200 mr-2')}>
                <Text>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => { 
                try { await Share.share({ message: incident.blockchain_tx }); } catch(e){}}
              } style={tailwind('px-3 py-1 rounded bg-gray-200') }>
                <Text>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setModalVisible(false)} style={{ position: 'absolute', top: 40, right: 20 }}>
            <Text style={{ color: '#fff', fontSize: 18 }}>Close</Text>
          </TouchableOpacity>
          {activeEvidence && (
            <Image source={{ uri: activeEvidence.url }} style={{ width: '92%', height: '80%' }} resizeMode="contain" />
          )}
        </View>
      </Modal>
      <MenuBar navigation={navigation} />
    </ScrollView>
  );
};

export default IncidentDetailScreen;
import React, { useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Alert, Modal, TouchableOpacity, Share } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import AcknowledgeButton from '../components/AcknowledgeButton';
import MenuBar from '../components/MenuBar';
import { Video } from 'expo-av';
import { WebView } from 'react-native-webview';

const IncidentDetailScreen = ({ route, navigation }) => {
  const tailwind = useTailwind();
  const { incident: initialIncident } = route.params || {};
  const [incident, setIncident] = useState(initialIncident || {});
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
      // Try multiple clipboard implementations (expo, community, react-native)
      let clipboard = null;
      try { clipboard = require('expo-clipboard'); } catch (e) {}
      try { if (!clipboard) clipboard = require('@react-native-clipboard/clipboard'); } catch (e) {}
      try { if (!clipboard) clipboard = require('react-native').Clipboard; } catch (e) {}

      if (clipboard) {
        if (clipboard.setStringAsync) await clipboard.setStringAsync(text);
        else if (clipboard.setString) clipboard.setString(text);
        else throw new Error('Clipboard method not found');
        Alert.alert('Copied', 'Transaction ID copied to clipboard');
      } else {
        // Fallback: open share dialog so user can copy from there
        await Share.share({ message: text });
        Alert.alert('Shared', 'Opened share dialog (no clipboard available).');
      }
    } catch (err) {
      console.warn('Clipboard write failed', err);
      Alert.alert('Error', 'Could not copy or share the transaction id.');
    }
  };

  const renderEvidence = (evidence = []) => {
    if (!evidence || evidence.length === 0) {
      return <Text style={tailwind('text-center mt-4')}>No evidence available.</Text>;
    }

    return evidence.map((item, index) => {
      const url = item.url || '';
      const isImage = url.match(/\.(jpeg|jpg|gif|png)$/i);
      const isVideo = url.match(/\.(mp4|mov|avi|mkv|m3u8)$/i);
      const isMjpeg = url.toLowerCase().includes('mjpeg') || url.toLowerCase().includes('mjpg');

      return (
        <View key={index} style={tailwind('mb-4 bg-white rounded-lg overflow-hidden border p-2')}>
          <Text style={tailwind('font-semibold mb-2')}>Evidence {index + 1}</Text>

          {isImage && (
            <TouchableOpacity onPress={() => { setActiveEvidence(item); setModalVisible(true); }}>
              <Image source={{ uri: url }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
            </TouchableOpacity>
          )}

          {isVideo && (
            <Video
              source={{ uri: url }}
              rate={1.0}
              volume={1.0}
              isMuted={false}
              resizeMode="contain"
              shouldPlay={false}
              isLooping={false}
              useNativeControls
              style={{ width: '100%', height: 220 }}
              onError={(e) => console.log('Video load error:', e)}
            />
          )}

          {isMjpeg && (
            <View style={{ height: 220 }}>
              <WebView source={{ uri: url }} style={{ flex: 1 }} />
            </View>
          )}

          {!isImage && !isVideo && !isMjpeg && (
            <View style={tailwind('p-4')}>
              <Text>Unsupported evidence type or URL: {url}</Text>
            </View>
          )}

          <Text style={tailwind('text-sm mt-2')}>Hash: {item.hash}</Text>
        </View>
      );
    });
  };

  return (
    <ScrollView style={tailwind('flex-1 bg-gray-100 p-4')}>
      <Text style={tailwind('text-3xl font-bold mb-6 text-gray-800')}>Incident Details</Text>

      <View style={tailwind('bg-white p-4 rounded-lg shadow-md mb-6')}>
        <Text style={tailwind('text-xl font-bold mb-2')}>Incident ID: {incident.id}</Text>
        <Text style={tailwind('text-lg mb-1')}>Type: {incident.type}</Text>
        <Text style={tailwind('text-md mb-1')}>Timestamp: {incident.timestamp ? new Date(incident.timestamp).toLocaleString() : 'N/A'}</Text>
        <Text style={tailwind('text-md mb-1')}>Location: {incident.location || 'N/A'}</Text>
        <Text style={tailwind(`text-lg font-semibold mt-2`)}>
          Acknowledged: {incident.acknowledged ? 'Yes' : 'No'}
        </Text>

        {incident.blockchain_tx && (
          <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}> 
            <Text style={tailwind('text-sm')}>Blockchain TX: {String(incident.blockchain_tx).slice(0, 12)}...</Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={() => copyToClipboard(String(incident.blockchain_tx))} style={tailwind('px-3 py-1 rounded bg-gray-200 mr-2')}>
                <Text>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => { try { await Share.share({ message: String(incident.blockchain_tx) }); } catch (e) {}}} style={tailwind('px-3 py-1 rounded bg-gray-200') }>
                <Text>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <Text style={tailwind('text-2xl font-bold mb-4')}>Evidence</Text>
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
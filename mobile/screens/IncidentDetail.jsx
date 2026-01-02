import React, { useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Alert, Modal, TouchableOpacity, Share, StatusBar } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';
import AcknowledgeButton from '../components/AcknowledgeButton';
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
      return (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Ionicons name="image-outline" size={48} color="#D1D5DB" />
          <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8 }}>No evidence available</Text>
        </View>
      );
    }

    return evidence.map((item, index) => {
      const url = item.url || '';
      const isImage = url.match(/\.(jpeg|jpg|gif|png)$/i);
      const isVideo = url.match(/\.(mp4|mov|avi|mkv|m3u8)$/i);
      const isMjpeg = url.toLowerCase().includes('mjpeg') || url.toLowerCase().includes('mjpg');

      return (
        <View key={index} style={{ 
          marginBottom: 16, 
          backgroundColor: '#F9FAFB', 
          borderRadius: 8, 
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#E5E7EB'
        }}>
          <View style={{ 
            backgroundColor: '#EEF2FF', 
            paddingHorizontal: 12, 
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="document-attach" size={16} color="#4F46E5" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#4F46E5', marginLeft: 6 }}>
                Evidence {index + 1}
              </Text>
            </View>
            {isImage && (
              <TouchableOpacity onPress={() => { setActiveEvidence(item); setModalVisible(true); }}>
                <Ionicons name="expand" size={18} color="#4F46E5" />
              </TouchableOpacity>
            )}
          </View>

          <View style={{ padding: 8 }}>
            {isImage && (
              <TouchableOpacity onPress={() => { setActiveEvidence(item); setModalVisible(true); }}>
                <Image 
                  source={{ uri: url }} 
                  style={{ width: '100%', height: 220, borderRadius: 6 }} 
                  resizeMode="cover" 
                />
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
                style={{ width: '100%', height: 220, borderRadius: 6 }}
                onError={(e) => console.log('Video load error:', e)}
              />
            )}

            {isMjpeg && (
              <View style={{ height: 220, borderRadius: 6, overflow: 'hidden' }}>
                <WebView source={{ uri: url }} style={{ flex: 1 }} />
              </View>
            )}

            {!isImage && !isVideo && !isMjpeg && (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Ionicons name="alert-circle" size={32} color="#F59E0B" />
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
                  Unsupported evidence type
                </Text>
                <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }} numberOfLines={1}>
                  {url}
                </Text>
              </View>
            )}

            {item.hash && (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>
                  Hash: {item.hash.slice(0, 16)}...
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    });
  };

  const getSeverityColor = (severity) => {
    const severityMap = {
      critical: '#DC2626',
      high: '#EF4444',
      medium: '#F59E0B',
      low: '#10B981'
    };
    return severityMap[severity] || '#6B7280';
  };

  const getStatusColor = (acknowledged) => {
    return acknowledged ? '#10B981' : '#EF4444';
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={{ 
        backgroundColor: '#FFFFFF', 
        paddingTop: 50, 
        paddingBottom: 16, 
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 3
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1F2937' }}>Incident Details</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Incident Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
          marginBottom: 20
        }}>
          {/* Incident ID Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ 
                backgroundColor: '#EEF2FF', 
                paddingHorizontal: 12, 
                paddingVertical: 6, 
                borderRadius: 8 
              }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#4F46E5' }}>
                  #{incident.id}
                </Text>
              </View>
            </View>
            
            {/* Status Badge */}
            <View style={{ 
              backgroundColor: getStatusColor(incident.acknowledged), 
              paddingHorizontal: 12, 
              paddingVertical: 6, 
              borderRadius: 8 
            }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' }}>
                {incident.acknowledged ? 'HANDLED' : 'PENDING'}
              </Text>
            </View>
          </View>

          {/* Severity Badge */}
          {incident.severity && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="warning" size={20} color={getSeverityColor(incident.severity)} />
              <View style={{ 
                backgroundColor: getSeverityColor(incident.severity), 
                paddingHorizontal: 10, 
                paddingVertical: 4, 
                borderRadius: 6,
                marginLeft: 8
              }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' }}>
                  {incident.severity?.toUpperCase()}
                </Text>
              </View>
            </View>
          )}

          {/* Details Grid */}
          <View style={{ gap: 12 }}>
            {/* Type */}
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Type</Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                  {incident.type || 'N/A'}
                </Text>
              </View>
            </View>

            {/* Camera Name */}
            {incident.camera?.name && (
              <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Camera</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="videocam" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                      {incident.camera.name}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Location */}
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Location</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="location" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                    {incident.camera?.location || incident.location || 'N/A'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Owner */}
            {incident.camera?.admin_user?.username && (
              <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Owner</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="person" size={16} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                      {incident.camera.admin_user.username}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Timestamp */}
            <View style={{ flexDirection: 'row', paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Timestamp</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="time" size={16} color="#6B7280" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>
                    {incident.timestamp ? new Date(incident.timestamp).toLocaleString() : 'N/A'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Blockchain TX */}
          {incident.blockchain_tx && (
            <View style={{ 
              marginTop: 16, 
              padding: 12, 
              backgroundColor: '#F9FAFB', 
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#E5E7EB'
            }}>
              <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>Blockchain Transaction</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#1F2937', flex: 1 }} numberOfLines={1}>
                  {String(incident.blockchain_tx).slice(0, 20)}...
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity 
                    onPress={() => copyToClipboard(String(incident.blockchain_tx))} 
                    style={{ 
                      paddingHorizontal: 12, 
                      paddingVertical: 6, 
                      borderRadius: 6, 
                      backgroundColor: '#E5E7EB' 
                    }}
                  >
                    <Ionicons name="copy" size={16} color="#1F2937" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={async () => { 
                      try { 
                        await Share.share({ message: String(incident.blockchain_tx) }); 
                      } catch (e) {}
                    }} 
                    style={{ 
                      paddingHorizontal: 12, 
                      paddingVertical: 6, 
                      borderRadius: 6, 
                      backgroundColor: '#E5E7EB' 
                    }}
                  >
                    <Ionicons name="share-social" size={16} color="#1F2937" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Evidence Section */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
          marginBottom: 20
        }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 16 }}>Evidence</Text>
          {renderEvidence(incident.evidence)}
        </View>

        {/* Acknowledge Button */}
        {incident.status !== 'acknowledged' && !incident.acknowledged && (
          <View style={{ marginBottom: 20 }}>
            <AcknowledgeButton incidentId={incident.id} onAcknowledgeSuccess={handleAcknowledgeSuccess} />
          </View>
        )}
      </ScrollView>

      {/* Loading Overlay */}
      {loading && (
        <View style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center' 
        }}>
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            padding: 24, 
            borderRadius: 12, 
            alignItems: 'center' 
          }}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={{ color: '#1F2937', marginTop: 12, fontSize: 14, fontWeight: '600' }}>
              Updating incident...
            </Text>
          </View>
        </View>
      )}

      {/* Evidence Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={() => setModalVisible(false)} 
            style={{ 
              position: 'absolute', 
              top: 50, 
              right: 20,
              backgroundColor: 'rgba(255,255,255,0.2)',
              padding: 12,
              borderRadius: 8
            }}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {activeEvidence && (
            <Image 
              source={{ uri: activeEvidence.url }} 
              style={{ width: '92%', height: '80%' }} 
              resizeMode="contain" 
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

export default IncidentDetailScreen;
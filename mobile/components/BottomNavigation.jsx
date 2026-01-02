// components/BottomNavigation.jsx
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';

const BottomNavigation = ({ navigation, activeRoute, role = 'viewer' }) => {
  const tailwind = useTailwind();

  const getNavItems = () => {
    if (role === 'admin') {
      return [
        { name: 'Home', route: 'AdminDashboard', icon: 'home' },
        { name: 'Incidents', route: 'IncidentList', icon: 'list' },
        { name: 'Security', route: 'GrantAccess', icon: 'shield' },
        { name: 'Profile', route: 'AdminProfile', icon: 'person' },
      ];
    } else if (role === 'security') {
      return [
        { name: 'Home', route: 'SecurityDashboard', icon: 'home' },
        { name: 'SOS Alerts', route: 'IncidentList', icon: 'alert-circle' },
        { name: 'Profile', route: 'Profile', icon: 'person' },
      ];
    } else {
      return [
        { name: 'Home', route: 'ViewerDashboard', icon: 'home' },
        { name: 'Incidents', route: 'IncidentList', icon: 'list' },
        { name: 'Report', route: 'Acknowledgement', icon: 'add-circle' },
        { name: 'Profile', route: 'Profile', icon: 'person' },
      ];
    }
  };

  const navItems = getNavItems();

  return (
    <View style={[
      tailwind('flex-row bg-white'),
      { 
        paddingBottom: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 10
      }
    ]}>
      {navItems.map((item, index) => {
        const isActive = activeRoute === item.route;
        return (
          <TouchableOpacity
            key={index}
            style={tailwind('flex-1 items-center justify-center')}
            onPress={() => navigation.navigate(item.route)}
            activeOpacity={0.7}
          >
            <View style={tailwind('items-center')}>
              <Ionicons 
                name={isActive ? item.icon : `${item.icon}-outline`} 
                size={24} 
                color={isActive ? '#6366F1' : '#9CA3AF'} 
              />
              <Text
                style={[
                  tailwind('text-xs mt-1'),
                  { 
                    color: isActive ? '#6366F1' : '#9CA3AF', 
                    fontWeight: isActive ? '600' : '400' 
                  }
                ]}
              >
                {item.name}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default BottomNavigation;

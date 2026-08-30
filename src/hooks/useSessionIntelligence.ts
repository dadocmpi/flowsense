import { useState, useEffect } from 'react';

export const useSessionIntelligence = () => {
  const [sessionData, setSessionData] = useState({
    currentSession: 'CLOSED' as 'GOLD' | 'US500' | 'CLOSED',
    sessionStart: '',
    sessionEnd: '',
    timeSinceSessionStart: 0,
    timeUntilSessionEnd: 0,
    isSessionActive: false,
    madridTime: '',
    newYorkTime: '',
  });

  useEffect(() => {
    const updateSession = () => {
      // Get current time in Madrid and New York
      const now = new Date();
      const madridOptions = { timeZone: 'Europe/Madrid', hour12: false };
      const newYorkOptions = { timeZone: 'America/New_York', hour12: false };
      
      const madridTime = new Intl.DateTimeFormat('en-GB', {
        ...madridOptions,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(now);
      
      const newYorkTime = new Intl.DateTimeFormat('en-GB', {
        ...newYorkOptions,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(now);
      
      const madridHours = parseInt(madridTime.split(':')[0]);
      const madridMinutes = parseInt(madridTime.split(':')[1]);
      const madridTotalMinutes = madridHours * 60 + madridMinutes;
      
      const newYorkHours = parseInt(newYorkTime.split(':')[0]);
      const newYorkMinutes = parseInt(newYorkTime.split(':')[1]);
      const newYorkTotalMinutes = newYorkHours * 60 + newYorkMinutes;
      
      // GOLD session: 09:00-12:00 Madrid time (540-720 minutes)
      const goldStart = 9 * 60; // 540
      const goldEnd = 12 * 60; // 720
      
      // US500 session: 15:30-19:00 Madrid time (930-1140 minutes)
      // Which is 09:30-13:00 New York time (570-780 minutes) when converting
      const us500MadridStart = 15 * 60 + 30; // 930
      const us500MadridEnd = 19 * 60; // 1140
      
      let currentSession: 'GOLD' | 'US500' | 'CLOSED' = 'CLOSED';
      let sessionStart = '';
      let sessionEnd = '';
      let isSessionActive = false;
      
      if (madridTotalMinutes >= goldStart && madridTotalMinutes < goldEnd) {
        currentSession = 'GOLD';
        sessionStart = '09:00';
        sessionEnd = '12:00';
        isSessionActive = true;
      } else if (madridTotalMinutes >= us500MadridStart && madridTotalMinutes < us500MadridEnd) {
        currentSession = 'US500';
        sessionStart = '15:30';
        sessionEnd = '19:00';
        isSessionActive = true;
      }
      
      const timeSinceSessionStart = isSessionActive 
        ? madridTotalMinutes - 
          (currentSession === 'GOLD' ? goldStart : us500MadridStart)
        : 0;
      
      const timeUntilSessionEnd = isSessionActive
        ? (currentSession === 'GOLD' ? goldEnd : us500MadridEnd) - madridTotalMinutes
        : 0;
      
      setSessionData({
        currentSession,
        sessionStart,
        sessionEnd,
        timeSinceSessionStart,
        timeUntilSessionEnd,
        isSessionActive,
        madridTime,
        newYorkTime,
      });
    };
    
    updateSession();
    const interval = setInterval(updateSession, 1000);
    return () => clearInterval(interval);
  }, []);
  
  return sessionData;
};
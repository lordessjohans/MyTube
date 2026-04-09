import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, setDoc, orderBy, getDoc, getDocs, updateDoc, arrayUnion, or, where } from 'firebase/firestore';
import { db, auth, loginWithGoogle, logout } from './firebase';
import { Users, LogIn, LogOut, MessageSquare, Send, Video, VideoOff, Mic, MicOff, Lock, Globe, UserPlus, Check, X, Edit3 } from 'lucide-react';
import { AvatarEditor } from './AvatarEditor';

const AVATAR_STYLES = [
  { id: 'circle', name: 'Circle', class: 'rounded-full' },
  { id: 'squircle', name: 'Squircle', class: 'rounded-[2rem]' },
  { id: 'hexagon', name: 'Hexagon', class: '[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]' },
  { id: 'star', name: 'Star', class: '[clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]' },
  { id: 'diamond', name: 'Diamond', class: '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]' }
];

const AVATAR_ANIMATIONS = [
  { id: 'none', name: 'None', class: '' },
  { id: 'pulse', name: 'Pulse', class: 'animate-pulse' },
  { id: 'spin-slow', name: 'Spin', class: 'animate-[spin_10s_linear_infinite]' },
  { id: 'bounce-slow', name: 'Bounce', class: 'animate-[bounce_3s_infinite]' },
  { id: 'wiggle', name: 'Wiggle', class: 'animate-[wiggle_2s_ease-in-out_infinite]' }
];

export function TeamCommunication() {
  const [user, setUser] = useState<any>(null);
  const [authUser, setAuthUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [currentMeeting, setCurrentMeeting] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [newMeetingName, setNewMeetingName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [showInviteMenu, setShowInviteMenu] = useState(false);
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setAuthUser(currentUser);
      
      if (currentUser) {
        // Ensure user profile exists
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Anonymous User',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || '',
            role: 'user',
            avatarStyle: 'circle',
            avatarAnimation: 'none'
          });
        }
      } else {
        setUser(null);
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    
    const unsubscribe = onSnapshot(doc(db, 'users', authUser.uid), (doc) => {
      if (doc.exists()) {
        setUser(doc.data());
      }
      setIsAuthReady(true);
    });
    
    return () => unsubscribe();
  }, [authUser]);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const fetchUsers = async () => {
      try {
        const q = query(collection(db, 'users'));
        const snap = await getDocs(q);
        setAllUsers(snap.docs.map(d => d.data()).filter(u => u.uid !== user.uid));
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };
    fetchUsers();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const q = query(collection(db, `users/${user.uid}/invitations`), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error fetching invitations:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const q = query(
      collection(db, 'meetings'),
      or(
        where('isPrivate', '==', false),
        where('participants', 'array-contains', user.uid)
      )
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meetingList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      meetingList.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });
      setMeetings(meetingList);
      
      // Update current meeting if it exists in the new list
      if (currentMeeting) {
        const updatedCurrent = meetingList.find(m => m.id === currentMeeting.id);
        if (updatedCurrent) {
          setCurrentMeeting(updatedCurrent);
        }
      }
    }, (error) => {
      console.error("Error fetching meetings:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!currentMeeting || !user) return;

    const q = query(collection(db, `meetings/${currentMeeting.id}/messages`), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(messageList);
    }, (error) => {
      console.error("Error fetching messages:", error);
    });

    return () => {
      unsubscribe();
    };
  }, [currentMeeting, user]);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingName.trim() || !user) return;

    try {
      const docRef = await addDoc(collection(db, 'meetings'), {
        name: newMeetingName,
        hostId: user.uid,
        isPrivate,
        participants: [user.uid],
        createdAt: serverTimestamp()
      });

      if (shareToFeed) {
        await addDoc(collection(db, 'site_feed'), {
          userName: user.displayName,
          userPhoto: user.photoURL,
          description: `Live Stream: ${newMeetingName}`,
          meetingId: docRef.id,
          createdAt: serverTimestamp()
        });
      }

      setNewMeetingName('');
      setShareToFeed(false);
      setCurrentMeeting({ id: docRef.id, name: newMeetingName, hostId: user.uid, isPrivate, participants: [user.uid] });
    } catch (error) {
      console.error("Error creating meeting:", error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentMeeting || !user) return;

    try {
      await addDoc(collection(db, `meetings/${currentMeeting.id}/messages`), {
        meetingId: currentMeeting.id,
        senderId: user.uid,
        senderName: user.displayName || 'User',
        text: newMessage,
        createdAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleAcceptInvite = async (inv: any) => {
    try {
      await updateDoc(doc(db, 'meetings', inv.meetingId), {
        participants: arrayUnion(user.uid)
      });
      await updateDoc(doc(db, `users/${user.uid}/invitations`, inv.id), {
        status: 'accepted'
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
    }
  };

  const handleDeclineInvite = async (inv: any) => {
    try {
      await updateDoc(doc(db, `users/${user.uid}/invitations`, inv.id), {
        status: 'declined'
      });
    } catch (error) {
      console.error("Error declining invite:", error);
    }
  };

  const handleSendInvite = async (targetUserId: string) => {
    if (!currentMeeting) return;
    try {
      await addDoc(collection(db, `users/${targetUserId}/invitations`), {
        meetingId: currentMeeting.id,
        meetingName: currentMeeting.name,
        hostId: user.uid,
        hostName: user.displayName,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setShowInviteMenu(false);
    } catch (error) {
      console.error("Error sending invite:", error);
    }
  };

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [shareToFeed, setShareToFeed] = useState(false);

  const startRecording = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const recorder = new MediaRecorder(stream);
      setRecordedChunks([]);
      setRecordedVideoUrl(null);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          setRecordedChunks(prev => [...prev, e.data]);
        }
      };

      recorder.onstop = () => {
        setIsRecording(false);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  };

  const saveRecording = () => {
    if (recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `stream-${Date.now()}.webm`;
      a.click();
    }
  };

  const shareRecordingToFeed = async () => {
    if (!recordedVideoUrl || !user) return;
    try {
      // In a real app, we would upload the Blob to Firebase Storage here.
      // For this prototype, we'll just create a feed entry indicating a shared stream.
      await addDoc(collection(db, 'site_feed'), {
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoURL,
        description: `Shared a stream: ${currentMeeting?.name || 'Untitled'}`,
        createdAt: serverTimestamp(),
        likes: 0
      });
      alert('Stream shared to site feed!');
      setRecordedVideoUrl(null);
    } catch (error) {
      console.error("Error sharing to feed:", error);
    }
  };

  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (currentMeeting && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.error("Error accessing webcam for meeting:", err));
    }
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [currentMeeting]);

  if (!isAuthReady) {
    return <div className="p-4 text-white/50 text-xs">Loading authentication...</div>;
  }

  const handleJoinMeeting = async (meeting: any) => {
    setCurrentMeeting(meeting);
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-white/10 bg-white/5 text-center">
        <Users className="w-8 h-8 text-white/50 mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">Team Communication</h3>
        <p className="text-xs text-white/50 mb-6">Sign in to join private streams and group meetings.</p>
        <button
          onClick={loginWithGoogle}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold text-xs uppercase tracking-widest hover:bg-white/90 transition-colors"
        >
          <LogIn className="w-4 h-4" />
          Sign In with Google
        </button>
      </div>
    );
  }

  const getUserAvatarClass = (u: any) => {
    const styleClass = AVATAR_STYLES.find(s => s.id === (u?.avatarStyle || 'circle'))?.class || 'rounded-full';
    const animClass = AVATAR_ANIMATIONS.find(a => a.id === (u?.avatarAnimation || 'none'))?.class || '';
    return `${styleClass} ${animClass}`;
  };

  return (
    <div className="flex flex-col h-[400px] border border-white/10 bg-white/5 relative">
      {showAvatarEditor && <AvatarEditor user={user} onClose={() => setShowAvatarEditor(false)} />}
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-3">
          <div className="relative group cursor-pointer" onClick={() => setShowAvatarEditor(true)}>
            <img 
              src={user.photoURL || ''} 
              alt="Profile" 
              className={`w-10 h-10 border border-white/20 object-cover transition-all ${getUserAvatarClass(user)}`} 
            />
            <div className={`absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${getUserAvatarClass(user)}`}>
              <Edit3 className="w-4 h-4 text-white" />
            </div>
          </div>
          <div>
            <div className="font-bold text-white text-sm">{user.displayName}</div>
            <div className="text-[10px] text-white/50">{user.email}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAvatarEditor(true)}
            className="p-2 text-white/50 hover:text-white transition-colors"
            title="Edit Profile"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            className="p-2 text-white/50 hover:text-white transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!currentMeeting ? (
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          
          {invitations.length > 0 && (
            <div className="mb-4">
              <h3 className="font-bold text-white mb-2 uppercase tracking-widest text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                Pending Invitations
              </h3>
              <div className="space-y-2">
                {invitations.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 bg-orange-500/10 border border-orange-500/30">
                    <div>
                      <div className="text-sm text-white">{inv.meetingName}</div>
                      <div className="text-[10px] text-white/50">From: {inv.hostName}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAcceptInvite(inv)} className="p-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeclineInvite(inv)} className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs">Active Streams</h3>
          
          <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2">
            {meetings.length === 0 ? (
              <div className="text-xs text-white/40 italic">No active streams found.</div>
            ) : (
              meetings.map(meeting => {
                const isHost = meeting.hostId === user.uid;
                const canJoin = true;
                
                return (
                  <div key={meeting.id} className="w-full flex flex-col p-3 bg-black/20 border border-white/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {meeting.isPrivate ? <Lock className="w-4 h-4 text-red-400" /> : <Globe className="w-4 h-4 text-orange-400" />}
                        <span className="text-sm text-white">{meeting.name}</span>
                      </div>
                      <button
                        onClick={() => handleJoinMeeting(meeting)}
                        className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                      >
                        Join
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleCreateMeeting} className="mt-auto flex flex-col gap-2 pt-4 border-t border-white/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMeetingName}
                onChange={(e) => setNewMeetingName(e.target.value)}
                placeholder="New stream name..."
                className="flex-1 bg-black/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={!newMeetingName.trim()}
                className="px-4 py-2 bg-orange-500/20 text-orange-400 border border-orange-500/50 hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-widest"
              >
                Create
              </button>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="accent-orange-500"
                />
                Private Stream
              </label>
              <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareToFeed}
                  onChange={(e) => setShareToFeed(e.target.checked)}
                  className="accent-orange-500"
                />
                Share to Feed
              </label>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-3 bg-black/40 border-b border-white/10 shrink-0 relative">
            <div className="flex items-center gap-2">
              {currentMeeting.isPrivate ? <Lock className="w-4 h-4 text-red-400" /> : <Globe className="w-4 h-4 text-orange-400" />}
              <span className="font-bold text-white text-sm">{currentMeeting.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {currentMeeting.hostId === user.uid && (
                <button
                  onClick={() => setShowInviteMenu(!showInviteMenu)}
                  className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
                  title="Invite Users"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => { setCurrentMeeting(null); setShowInviteMenu(false); }}
                className="text-[10px] text-white/50 hover:text-white uppercase tracking-widest ml-2"
              >
                Leave
              </button>
            </div>
            
            {/* Invite Menu Dropdown */}
            {showInviteMenu && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-zinc-900 border border-white/20 shadow-xl z-50 max-h-48 overflow-y-auto">
                <div className="p-2 text-[10px] font-bold text-white/50 uppercase tracking-widest border-b border-white/10">Invite Users</div>
                {allUsers.length === 0 ? (
                  <div className="p-3 text-xs text-white/40 italic">No other users found.</div>
                ) : (
                  allUsers.map(u => (
                    <button
                      key={u.uid}
                      onClick={() => handleSendInvite(u.uid)}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                      <img src={u.photoURL || ''} alt="" className={`w-4 h-4 bg-white/20 object-cover ${getUserAvatarClass(u)}`} />
                      <span className="truncate">{u.displayName}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* Webcam View */}
            <div className="w-full h-32 bg-black/60 border border-white/10 relative overflow-hidden flex items-center justify-center shrink-0">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 text-[9px] text-white uppercase tracking-widest border border-white/20">
                {user.displayName} (You)
              </div>
              <div className="absolute top-2 right-2 flex gap-2">
                {!isRecording ? (
                  <button onClick={startRecording} className="px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/50 text-[9px] uppercase tracking-widest hover:bg-red-500/30">
                    Record
                  </button>
                ) : (
                  <button onClick={stopRecording} className="px-2 py-1 bg-white/20 text-white border border-white/50 text-[9px] uppercase tracking-widest hover:bg-white/30 animate-pulse">
                    Stop
                  </button>
                )}
                {!isRecording && recordedChunks.length > 0 && (
                  <button onClick={saveRecording} className="px-2 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/50 text-[9px] uppercase tracking-widest hover:bg-blue-500/30">
                    Save
                  </button>
                )}
                {recordedVideoUrl && (
                  <button onClick={shareRecordingToFeed} className="px-2 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/50 text-[9px] uppercase tracking-widest hover:bg-orange-500/30">
                    Share to Feed
                  </button>
                )}
              </div>
            </div>

            {/* Other Users in Room */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {currentMeeting.participants.filter((pId: string) => pId !== user.uid).map((pId: string) => {
                const participant = allUsers.find(u => u.uid === pId);
                if (!participant) return null;
                return (
                  <div key={pId} className="flex flex-col items-center gap-1 shrink-0">
                    <img 
                      src={participant.photoURL || ''} 
                      alt="" 
                      className={`w-10 h-10 object-cover bg-white/10 border border-white/20 ${getUserAvatarClass(participant)}`} 
                    />
                    <span className="text-[8px] text-white/50 uppercase tracking-widest truncate w-12 text-center">{participant.displayName}</span>
                  </div>
                );
              })}
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3">
              {messages.map(msg => {
                const isMe = msg.senderId === user.uid;
                const senderProfile = isMe ? user : allUsers.find(u => u.uid === msg.senderId);
                return (
                  <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <img 
                      src={senderProfile?.photoURL || ''} 
                      alt="" 
                      className={`w-6 h-6 object-cover bg-white/10 shrink-0 ${getUserAvatarClass(senderProfile)}`} 
                    />
                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <span className="text-[9px] text-white/40 uppercase tracking-widest mb-1">{msg.senderName}</span>
                      <div className={`px-3 py-2 max-w-[80%] text-sm ${isMe ? 'bg-orange-500/20 border border-orange-500/30 text-orange-100' : 'bg-white/10 border border-white/10 text-white'}`}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 bg-black/20 flex gap-2 shrink-0">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-black/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="p-2 bg-orange-500/20 text-orange-400 border border-orange-500/50 hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

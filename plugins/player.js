define(['apphost', 'pluginManager', 'events', 'embyRouter', 'playbackManager', 'connectionManager'], function (appHost, pluginManager, events, embyRouter, playbackManager, connectionManager) {
    'use strict';

    return function () {
        //alert("Plugin Loaded");
        
        var self = this;

        self.name = 'Linux Media Player';
        self.type = 'mediaplayer';
        self.id = 'linuxmediaplayer';
        self.requiresVideoTransparency = true;

        var currentPlayOptions = null;
        var playbackPosition = 0;
        var timeUpdateInterval;

        document.addEventListener('video-osd-show', function () {
            //alert("OSD Shown");
            startTimeUpdateInterval(1000);
            sendData("set_alpha", 90);
        });
        
        document.addEventListener('video-osd-hide', function () {
            //alert("OSD Hidden");
            startTimeUpdateInterval(10000);
            sendData("set_alpha", 255);
        }); 

        self.canPlayMediaType = function (mediaType) {
            //alert("canPlayMediaType");            
            if ((mediaType || '').toLowerCase() == 'video') {
                return true;
            }
            else {
                return false;
            }
        };
        
        self.canPlayItem = function (item) {
            //alert("canPlayItem");

            return true;
        };

        self.getDeviceProfile = function (item) {
            //alert("getDeviceProfile");
            
            var profile = {};

            profile.MaxStreamingBitrate = 100000000;
            profile.MaxStaticBitrate = 100000000;
            profile.MusicStreamingTranscodingBitrate = 192000;

            profile.DirectPlayProfiles = [];

            // leave container null for all
            profile.DirectPlayProfiles.push({
                Type: 'Video'
            });

            var apiClient = item && item.ServerId ? connectionManager.getApiClient(item.ServerId) : null;
            var supportsEmptyContainer = apiClient ? apiClient.isMinServerVersion('3.2.60.1') : false;

            if (supportsEmptyContainer) {
                // leave container null for all
                profile.DirectPlayProfiles.push({
                    Type: 'Audio'
                });
            }
            else {
                // for older servers that don't support leaving container blank
                profile.DirectPlayProfiles.push({
                    Container: 'aac,mp3,mpa,wav,wma,mp2,ogg,oga,webma,ape,opus,alac,flac,m4a',
                    Type: 'Audio'
                });
            }
            
            profile.TranscodingProfiles = [];
            /*
            profile.TranscodingProfiles.push({
                Container: 'ts',
                Type: 'Video',
                AudioCodec: 'ac3,mp3,aac',
                VideoCodec: 'h264,mpeg2video,hevc',
                Context: 'Streaming',
                Protocol: 'hls',
                MaxAudioChannels: '6',
                MinSegments: '1',
                BreakOnNonKeyFrames: true,
                SegmentLength: '3'
            });
            */
            profile.TranscodingProfiles.push({
                Container: 'mkv',
                Type: 'Video',
                AudioCodec: 'mp3,ac3,aac',
                VideoCodec: 'h264',
                Context: 'Streaming',
                MaxAudioChannels: '6'
            });
            profile.TranscodingProfiles.push({
                Container: 'mp3',
                Type: 'Audio',
                AudioCodec: 'mp3',
                Context: 'Streaming',
                Protocol: 'http'
            });
            
            profile.ContainerProfiles = [];

            profile.CodecProfiles = [];

            // Subtitle profiles
            // External vtt or burn in
            profile.SubtitleProfiles = [];

            profile.SubtitleProfiles.push({
                Format: 'srt',
                Method: 'External'
            });
            profile.SubtitleProfiles.push({
                Format: 'ass',
                Method: 'External'
            });
            profile.SubtitleProfiles.push({
                Format: 'ssa',
                Method: 'External'
            });
            profile.SubtitleProfiles.push({
                Format: 'srt',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'subrip',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'ass',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'ssa',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'pgs',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'pgssub',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'dvdsub',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'dvbsub',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'vtt',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'sub',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'idx',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'smi',
                Method: 'Embed'
            });
            profile.ResponseProfiles = [];

            return Promise.resolve(profile);
        };

        self.currentSrc = function () {
            //alert(currentPlayOptions.url);
            if(currentPlayOptions == null) {
                return "";
            }
            else {
                return currentPlayOptions.url;
            }
        };

        self.play = function (options) {
            //alert("Play")
            //var mediaSource = JSON.parse(JSON.stringify(options.mediaSource));

            if(currentPlayOptions != null && currentPlayOptions.url == options.url) {
                // we are already playing this file so just set position
                // need this in microseconds
                sendData("set_position", (options.playerStartPositionTicks / 10));
            }
            else {

                if(currentPlayOptions != null && currentPlayOptions.url != options.url) {
                    // we were already playing but the url changed so need to stop first
                    sendData("stop");
                }
                
                currentPlayOptions = options;
   
				var totalSeconds = (options.playerStartPositionTicks || 0) / 10000000;
				var hours = Math.floor(totalSeconds / 3600);
				totalSeconds %= 3600;
				var minutes = Math.floor(totalSeconds / 60);
				var seconds = totalSeconds % 60;
				var startTimeString = ("0" + hours).slice(-2) + ":" + ("0" + minutes).slice(-2) + ":" + ("0" + seconds).slice(-2);
				
                //var startTime = new Date(null);
                //startTime.setHours(0);
                //startTime.setMinutes(0);
                //startTime.setSeconds(0);
                //startTime.setMilliseconds(0);
                //startTime.setSeconds((options.playerStartPositionTicks || 0) / 10000000);
                //var startTimeString = startTime.toISOString().substr(11, 8);
				
				var liveStream = true;
				if (options.mediaSource.RunTimeTicks) {
					liveStream = false;
				}
                
                var playRequest = {
                    url: options.url,
                    startTime: startTimeString,
                    subtitleUrl: null,
                    subtitleCodec: null,
					liveStream: liveStream
                };
                var playData = JSON.stringify(playRequest);
   
                sendData("play", playData, playbackStartedAction);
                
                startTimeUpdateInterval(1000);
                embyRouter.showVideoOsd();
            }
            
            playbackPosition = (options.playerStartPositionTicks || 0) / 10;
            events.trigger(self, 'timeupdate');
            
            return Promise.resolve();
        };

        function playbackStartedAction() {
            //alert(currentPlayOptions.mediaSource.DefaultAudioStreamIndex);
            if(currentPlayOptions.mediaSource.DefaultAudioStreamIndex && currentPlayOptions.mediaSource.DefaultAudioStreamIndex != -1) {
                sendData("get_audio_tracks", "", processAudioTrackChange, currentPlayOptions.mediaSource.DefaultAudioStreamIndex.toString());
            }
        }

        self.currentTime = function (val) {
            //alert("currentTime");
            
            if (val != null) {
                alert("currentTime: " + val);
                sendData("set_position", val * 1000);
                return;
            }

            // needs to be milliseconds
            return playbackPosition / 1000;
        };

        self.duration = function (val) {
            //alert("duration");
            return 0;
        };

        self.stop = function (destroyPlayer, reportEnded) {
            //alert("stop");
            stopTimeUpdateInterval();
            currentPlayOptions = null;
            events.trigger(self, 'stopped');
            sendData("stop");
        };

        self.destroy = function () {
            //alert("destroy");
            currentPlayOptions = null;
            embyRouter.setTransparency('none');
        };

        self.pause = function () {
            //alert("pause");
            //events.trigger(self, 'pause');
            sendData("pause_toggle");
        };

        self.unpause = function () {
            //alert("unpause");
            //events.trigger(self, 'playing');
            sendData("resume");
        };

        self.paused = function () {
            //alert("paused");
            return false;
        };

        self.volume = function (val) {
            //alert("volume");
            if (val != null) {
                // set vol
                return;
            }

            return 0;
        };

        self.setSubtitleStreamIndex = function (index) {
            // need to check if selected subtitle is external
            if (index === -1) {
                sendData("hide_subtitles");
                return;
            }

            // See if we have an external text track
            var track = index === -1 ? null : (currentPlayOptions.mediaSource.MediaStreams || []).filter(function (t) {
                return t.Type === 'Subtitle' && t.Index === index;
            })[0];

            if (!track) {
                console.log('Error: track with index ' + index + ' not found');
                return;
            }
            
            if (track.DeliveryMethod === 'External') {
                // process External
                var serverId = currentPlayOptions.item.ServerId;
                var externalUrl = playbackManager.getSubtitleUrl(track, serverId);
                //alert(externalUrl);
                
                sendData("stop");

                var startTime = new Date(null);
                startTime.setSeconds(playbackPosition / 1000000);
                var startTimeString = startTime.toISOString().substr(11, 8);
				
				var liveStream = true;
				if (currentPlayOptions.mediaSource.RunTimeTicks) {
					liveStream = false;
				}
				
                var playRequest = {
                    url: currentPlayOptions.url,
                    startTime: startTimeString,
                    subtitleUrl: externalUrl,
                    subtitleCodec: track.Codec,
					liveStream: liveStream
                };
                var playData = JSON.stringify(playRequest);
   
                sendData("play", playData, playbackStartedAction); 
                
                // do the subtitle change
            }
            else if (track.DeliveryMethod === 'Embed') {
                // process Embedded
                sendData("get_subtitle_tracks", "", processSubtitleEmbeddedChange, index);
                sendData("show_subtitles");
            }
        };
        
        function processSubtitleEmbeddedChange(trackData, index) {
            
            var subtitles = JSON.parse(trackData);
            //alert(subtitles);
            
            var streams = currentPlayOptions.mediaSource.MediaStreams || [];

            var subtitleIndex = -1;
            var i, stream;

            for (i = 0; i < streams.length; i++) {
                stream = streams[i];
                if (stream.Type === 'Subtitle' && stream.DeliveryMethod === 'Embed') {
                    subtitleIndex++;

                    if (stream.Index === index) {
                        break;
                    }
                }
            }           
            
            stream = subtitles[subtitleIndex];
            
            if (stream) {
                //alert(JSON.stringify(stream));
                sendData("set_subtitle_track", stream["id"]);
            }           
            
        }

        self.setAudioStreamIndex = function (index) {
            sendData("get_audio_tracks", "", processAudioTrackChange, index);
        };
        
        function processAudioTrackChange(trackData, index) {
            var mediaSource = JSON.parse(trackData);
            //alert(mediaSource);
            
            var streams = currentPlayOptions.mediaSource.MediaStreams || [];
            var audioIndex = -1;
            var i, stream;

            for (i = 0; i < streams.length; i++) {
                stream = streams[i];
                if (stream.Type == 'Audio') {
                    audioIndex++;

                    if (stream.Index === parseInt(index)) {
                        break;
                    }
                }
            }
            
            stream = mediaSource[audioIndex];
            
            if (stream) {
                //alert(JSON.stringify(stream));
                sendData("set_audio_track", stream["id"]);
            }

        }
        

        self.canSetAudioStreamIndex = function () {
            return true;
        };

        self.setMute = function (mute) {
        };

        self.isMuted = function () {
            return false;
        };
        
        function startTimeUpdateInterval(interval) {
            stopTimeUpdateInterval();
            //alert("startTimeUpdateInterval: " + interval);
            timeUpdateInterval = setInterval(onTimeUpdate, interval);
        }        
        
        function stopTimeUpdateInterval() {
            if (timeUpdateInterval) {
                clearInterval(timeUpdateInterval);
                timeUpdateInterval = null;
            }
        }
        
        function onTimeUpdate() {
            //alert("onTimeUpdate");
            sendData("get_position", false, updatePlayerPosition);
        }
        
        function updatePlayerPosition(data) {
            try {
                //alert("Doing Timed Update: " + data);
                var newPosition = parseInt(data);
                if(newPosition > 0) {
                    playbackPosition = newPosition;
                    events.trigger(self, 'timeupdate');
                }
            }
            catch(e) {
                console.log("ERROR - updatePlayerPosition: " + e);
            }
        }
        
                
        function setCurrentPos(data) {
            console.log(data);
        }

        function sendData(action, sendData, callback, callbackData) {
            var encodedSendData = "";
            if(sendData) {
                encodedSendData = encodeURIComponent(sendData.toString());
            }

            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'linuxplayer://' + action + '?data=' + encodedSendData, true);
            xhr.onload = function () {
            if (this.response) {
                var data = this.response;
                if(callback) {
                    callback(data, callbackData);
                }
            }};
            xhr.send();
        }
        
    }
});

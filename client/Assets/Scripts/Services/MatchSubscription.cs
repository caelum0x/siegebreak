using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace Siegebreak.Services
{
    /// <summary>
    /// Real-time matchmaking subscription over WS /matchmaking/subscribe. The
    /// receive loop runs off the main thread and enqueues frames; call
    /// <see cref="Update"/> from a MonoBehaviour each frame to raise events on
    /// the main thread (Unity APIs are not thread-safe). Use alongside the
    /// status poll: this is the low-latency accelerator, not the source of truth.
    /// </summary>
    public class MatchSubscription : IDisposable
    {
        private ClientWebSocket _socket;
        private CancellationTokenSource _cts;
        private readonly ConcurrentQueue<MatchSocketMessage> _incoming =
            new ConcurrentQueue<MatchSocketMessage>();

        /// <summary>Raised with the allocated session id when a match is found.</summary>
        public event Action<string> OnMatched;

        /// <summary>Raised on connect/receive failure so callers can fall back to poll.</summary>
        public event Action<string> OnError;

        public bool IsConnected => _socket != null && _socket.State == WebSocketState.Open;

        public async Task Connect()
        {
            if (!SessionStore.IsAuthenticated)
            {
                EnqueueError("not_authenticated");
                return;
            }

            Close();
            _cts = new CancellationTokenSource();
            _socket = new ClientWebSocket();

            try
            {
                var url = new Uri(
                    BackendConfig.WebSocketUrl("/matchmaking/subscribe", SessionStore.AccessToken));
                await _socket.ConnectAsync(url, _cts.Token);
                _ = ReceiveLoop(_cts.Token);
            }
            catch (Exception e)
            {
                EnqueueError(e.Message);
            }
        }

        private async Task ReceiveLoop(CancellationToken token)
        {
            var buffer = new byte[4096];
            try
            {
                while (_socket != null && _socket.State == WebSocketState.Open &&
                       !token.IsCancellationRequested)
                {
                    var sb = new StringBuilder();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", token);
                            return;
                        }
                        sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    } while (!result.EndOfMessage);

                    var msg = SafeParse(sb.ToString());
                    if (msg != null) _incoming.Enqueue(msg);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected on Close().
            }
            catch (Exception e)
            {
                EnqueueError(e.Message);
            }
        }

        /// <summary>Drain queued frames and raise events. Call every frame.</summary>
        public void Update()
        {
            while (_incoming.TryDequeue(out var msg))
            {
                if (msg.type == "matched" && !string.IsNullOrEmpty(msg.sessionId))
                {
                    OnMatched?.Invoke(msg.sessionId);
                }
                else if (msg.type == "error")
                {
                    OnError?.Invoke(msg.error);
                }
            }
        }

        private void EnqueueError(string error) =>
            _incoming.Enqueue(new MatchSocketMessage { type = "error", error = error });

        private static MatchSocketMessage SafeParse(string json)
        {
            try
            {
                return JsonUtility.FromJson<MatchSocketMessage>(json);
            }
            catch (Exception)
            {
                return null;
            }
        }

        public void Close()
        {
            try { _cts?.Cancel(); } catch (Exception) { /* already disposed */ }
            try { _socket?.Dispose(); } catch (Exception) { /* already disposed */ }
            _socket = null;
        }

        public void Dispose() => Close();
    }
}

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace Siegebreak.Services
{
    /// <summary>
    /// Real-time in-match transport over WS /sessions/:id/relay — the "local"
    /// SESSION_PROVIDER's concrete connection (see NetworkBootstrap and the
    /// backend's modules/sessions/relay.ts). Once connected, the server
    /// immediately reports whether this client is the match host (the
    /// authoritative simulation) or the guest (input + rendering only); every
    /// frame sent after that is relayed verbatim to the other participant.
    /// Same off-thread-receive / main-thread-drain shape as MatchSubscription:
    /// call <see cref="Update"/> every frame from a MonoBehaviour.
    /// </summary>
    public class MatchRelayClient : IDisposable
    {
        private ClientWebSocket _socket;
        private CancellationTokenSource _cts;
        private readonly ConcurrentQueue<RelayQueueItem> _incoming = new ConcurrentQueue<RelayQueueItem>();

        /// <summary>Raised once the server reports this client's role for the match.</summary>
        public event Action<RelayWelcome> OnWelcome;

        /// <summary>Raised for every frame forwarded from the other participant.</summary>
        public event Action<string> OnFrame;

        /// <summary>Raised on connect/receive failure or a rejected session.</summary>
        public event Action<string> OnError;

        public bool IsConnected => _socket != null && _socket.State == WebSocketState.Open;

        /// <summary>True once OnWelcome has reported this client as the match host.</summary>
        public bool IsHost { get; private set; }

        public async Task Connect(string sessionId)
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
                var path = "/sessions/" + Uri.EscapeDataString(sessionId) + "/relay";
                var url = new Uri(BackendConfig.WebSocketUrl(path, SessionStore.AccessToken));
                await _socket.ConnectAsync(url, _cts.Token);
                _ = ReceiveLoop(_cts.Token);
            }
            catch (Exception e)
            {
                EnqueueError(e.Message);
            }
        }

        /// <summary>
        /// Send one frame to the other participant. The payload is opaque to
        /// the transport (JSON encoded by the caller) — the backend relay
        /// forwards it unparsed, same contract on both ends.
        /// </summary>
        public async Task Send(string json)
        {
            if (!IsConnected) return;
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            try
            {
                await _socket.SendAsync(
                    new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
            }
            catch (Exception e)
            {
                EnqueueError(e.Message);
            }
        }

        private async Task ReceiveLoop(CancellationToken token)
        {
            var buffer = new byte[8192];
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

                    EnqueueFrame(sb.ToString());
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
            while (_incoming.TryDequeue(out var item))
            {
                switch (item.Kind)
                {
                    case RelayQueueItemKind.Welcome:
                        IsHost = item.Welcome.isHost;
                        OnWelcome?.Invoke(item.Welcome);
                        break;
                    case RelayQueueItemKind.Error:
                        OnError?.Invoke(item.Error);
                        break;
                    case RelayQueueItemKind.Frame:
                        OnFrame?.Invoke(item.Raw);
                        break;
                }
            }
        }

        private void EnqueueFrame(string raw)
        {
            var envelope = SafeParse<RelayEnvelopeType>(raw);
            if (envelope != null && envelope.type == "welcome")
            {
                var welcome = SafeParse<RelayWelcome>(raw);
                if (welcome != null)
                {
                    _incoming.Enqueue(RelayQueueItem.ForWelcome(welcome));
                    return;
                }
            }
            if (envelope != null && envelope.type == "error")
            {
                var err = SafeParse<RelayErrorFrame>(raw);
                _incoming.Enqueue(RelayQueueItem.ForError(err?.error ?? "unknown_error"));
                return;
            }

            // Anything else is an opaque gameplay frame forwarded from the
            // other participant — handed to the caller untouched.
            _incoming.Enqueue(RelayQueueItem.ForFrame(raw));
        }

        private void EnqueueError(string error) => _incoming.Enqueue(RelayQueueItem.ForError(error));

        private static T SafeParse<T>(string json)
        {
            try
            {
                return JsonUtility.FromJson<T>(json);
            }
            catch (Exception)
            {
                return default;
            }
        }

        public void Close()
        {
            try { _cts?.Cancel(); } catch (Exception) { /* already disposed */ }
            try { _socket?.Dispose(); } catch (Exception) { /* already disposed */ }
            _socket = null;
            IsHost = false;
        }

        public void Dispose() => Close();

        private enum RelayQueueItemKind { Welcome, Error, Frame }

        private readonly struct RelayQueueItem
        {
            public readonly RelayQueueItemKind Kind;
            public readonly RelayWelcome Welcome;
            public readonly string Error;
            public readonly string Raw;

            private RelayQueueItem(RelayQueueItemKind kind, RelayWelcome welcome, string error, string raw)
            {
                Kind = kind;
                Welcome = welcome;
                Error = error;
                Raw = raw;
            }

            public static RelayQueueItem ForWelcome(RelayWelcome welcome) =>
                new RelayQueueItem(RelayQueueItemKind.Welcome, welcome, null, null);

            public static RelayQueueItem ForError(string error) =>
                new RelayQueueItem(RelayQueueItemKind.Error, null, error, null);

            public static RelayQueueItem ForFrame(string raw) =>
                new RelayQueueItem(RelayQueueItemKind.Frame, null, null, raw);
        }
    }

    [Serializable]
    internal class RelayEnvelopeType
    {
        public string type;
    }

    [Serializable]
    internal class RelayErrorFrame
    {
        public string type;
        public string error;
    }

    /// <summary>Role/roster announcement sent once per connection by the relay.</summary>
    [Serializable]
    public class RelayWelcome
    {
        public string type; // "welcome"
        public bool isHost;
        public List<string> participants;
        public string mode;
        public string region;
    }
}

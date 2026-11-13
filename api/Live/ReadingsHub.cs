using Microsoft.AspNetCore.SignalR;

namespace SpaceApi.Live;

// contracts/api.md: SignalR hub /hubs/readings, event "reading".
// Clients only ever receive broadcasts here — nothing calls in, so the hub body is empty.
public class ReadingsHub : Hub;

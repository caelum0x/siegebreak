using System;
using UnityEngine;

namespace Siegebreak.Services
{
    /// <summary>
    /// JsonUtility can't (de)serialize a top-level JSON array, which several
    /// endpoints return (products, match history, leaderboard). This wraps the
    /// array in a single-field object so JsonUtility can parse it, then hands
    /// back the element array.
    /// </summary>
    public static class JsonHelper
    {
        [Serializable]
        private class Wrapper<T>
        {
            public T[] items;
        }

        public static T[] FromJsonArray<T>(string json)
        {
            if (string.IsNullOrEmpty(json)) return Array.Empty<T>();
            string wrapped = "{\"items\":" + json + "}";
            Wrapper<T> wrapper = JsonUtility.FromJson<Wrapper<T>>(wrapped);
            return wrapper != null && wrapper.items != null ? wrapper.items : Array.Empty<T>();
        }
    }
}

using System;

namespace FPClash
{
    public static class Extensions
    {
        /// <summary>Kotlin-style scope helper: run an action on <paramref name="obj"/> and return it.</summary>
        public static T also<T>(this T obj, Action<T> action)
        {
            action?.Invoke(obj);
            return obj;
        }
    }
}

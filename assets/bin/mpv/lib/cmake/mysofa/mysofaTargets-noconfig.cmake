#----------------------------------------------------------------
# Generated CMake target import file.
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "mysofa::mysofa-static" for configuration ""
set_property(TARGET mysofa::mysofa-static APPEND PROPERTY IMPORTED_CONFIGURATIONS NOCONFIG)
set_target_properties(mysofa::mysofa-static PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_NOCONFIG "C"
  IMPORTED_LOCATION_NOCONFIG "${_IMPORT_PREFIX}/lib/libmysofa.a"
  )

list(APPEND _cmake_import_check_targets mysofa::mysofa-static )
list(APPEND _cmake_import_check_files_for_mysofa::mysofa-static "${_IMPORT_PREFIX}/lib/libmysofa.a" )

# Import target "mysofa::mysofa-shared" for configuration ""
set_property(TARGET mysofa::mysofa-shared APPEND PROPERTY IMPORTED_CONFIGURATIONS NOCONFIG)
set_target_properties(mysofa::mysofa-shared PROPERTIES
  IMPORTED_LOCATION_NOCONFIG "${_IMPORT_PREFIX}/lib/libmysofa.so.1.3.3"
  IMPORTED_SONAME_NOCONFIG "libmysofa.so.1"
  )

list(APPEND _cmake_import_check_targets mysofa::mysofa-shared )
list(APPEND _cmake_import_check_files_for_mysofa::mysofa-shared "${_IMPORT_PREFIX}/lib/libmysofa.so.1.3.3" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)

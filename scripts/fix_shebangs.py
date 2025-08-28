"""
Shebang Remover for Python Scripts

Description:
    This script recursively finds and removes shebang (`#!`) lines from Python
    (`.py`) files within a specified directory. It is designed for environments
    where shebangs are not needed for script execution.

Key Options:
    -p, --path         Path to the directory to scan (default: ./env).
    -s, --show-only    List files with shebangs without modifying them (a dry run).
    --mode             'top' (default): Only check the first line of each file.
                       'any': Check all lines in each file.
    --paths            'local' (default): Remove shebangs with user/env-specific paths.
                       'non-local': Remove shebangs with system paths (e.g., /usr/bin/env).
                       'all': Remove all shebangs found.

Usage Examples:
    # 1. See which files have shebangs (dry run)

        python .\scripts\fix_shebangs.py --path ./my_env --show-only

    # 2. Remove only local shebangs from the top line (default behavior). In the root project folder in PowerShell 7.5

        python .\scripts\fix_shebangs.py --path .\env\

    # 3. Remove ALL shebangs from any position in every .py file

        python .\scripts\fix_shebangs.py --path ./my_env --mode any --paths all

WARNING:
    This script modifies files in-place. It is highly recommended to have a
    backup or use version control. Always perform a dry run with `--show-only` first.

"""

import pathlib
import sys
import argparse
import re

def is_local_path(path_bytes: bytes, env_path_bytes: bytes) -> bool:
    normalized_path = path_bytes.replace(b'\\', b'/').lower()

    common_non_local = [
        b'/usr/bin/env',
        b'/bin/sh',
        b'/bin/bash',
        b'/usr/bin/python'
    ]
    if any(non_local in normalized_path for non_local in common_non_local):
        return False

    if env_path_bytes.lower() in normalized_path:
        return True

    if normalized_path.startswith((b'/users/', b'/home/')):
        return True

    if re.match(b'^[a-z]:/', normalized_path):
        return True

    return False

def process_shebangs(env_path_str: str, mode: str, paths_filter: str, show_only: bool):
    env_path = pathlib.Path(env_path_str).resolve()
    env_path_bytes = bytes(str(env_path), 'utf-8')

    if not env_path.is_dir():
        print(f"Error: The provided path '{env_path}' is not a valid directory.", file=sys.stderr)
        return

    if show_only:
        print(f"Scanning for shebangs in *.py files in: {env_path}")
    else:
        print(f"Scanning *.py files in: {env_path}")
        print(f"Mode: '{mode}', Path Filter: '{paths_filter}'")

    found_files_count = 0
    for file_path in env_path.rglob('*.py'):
        if not file_path.is_file() or file_path.is_symlink():
            continue

        try:
            with file_path.open("rb") as f:
                content = f.read()
        except (PermissionError, IOError) as e:
            print(f"Skipping {file_path.relative_to(env_path)}: Could not read file. Reason: {e}", file=sys.stderr)
            continue

        if b'#!' not in content:
            continue

        lines = content.splitlines(True)
        shebang_lines = [line for line in lines if line.strip().startswith(b'#!')]

        if not shebang_lines:
            continue

        found_files_count += 1
        if show_only:
            print(f"\nFound in: {file_path.relative_to(env_path)}")
            for shebang in shebang_lines:
                try:
                    print(f"  -> {shebang.strip().decode('utf-8')}")
                except UnicodeDecodeError:
                    print(f"  -> {shebang.strip()}")
            continue

        new_lines = []
        modified = False

        if mode == 'top':
            if lines and lines[0] in shebang_lines:
                shebang_line = lines[0].strip()
                path_in_shebang = shebang_line.split(b' ', 1)[0][2:]
                is_local = is_local_path(path_in_shebang, env_path_bytes)
                should_remove = (
                    paths_filter == 'all' or
                    (paths_filter == 'local' and is_local) or
                    (paths_filter == 'non-local' and not is_local)
                )
                if should_remove:
                    new_lines = lines[1:]
                    modified = True
                else:
                    new_lines = lines
            else:
                new_lines = lines

        elif mode == 'any':
            for line in lines:
                if line in shebang_lines:
                    shebang_line = line.strip()
                    path_in_shebang = shebang_line.split(b' ', 1)[0][2:]
                    is_local = is_local_path(path_in_shebang, env_path_bytes)
                    should_remove = (
                        paths_filter == 'all' or
                        (paths_filter == 'local' and is_local) or
                        (paths_filter == 'non-local' and not is_local)
                    )
                    if not should_remove:
                        new_lines.append(line)
                    else:
                        modified = True
                else:
                    new_lines.append(line)

        if modified:
            print(f"Processing {file_path.relative_to(env_path)}...")
            new_content = b''.join(new_lines)
            try:
                with file_path.open("wb") as f:
                    f.write(new_content)
                print(f"  -> Successfully modified file.")
            except (PermissionError, IOError) as e:
                print(f"  -> FAILED to write to {file_path.relative_to(env_path)}. Reason: {e}", file=sys.stderr)

    if show_only and found_files_count == 0:
        print("No shebangs were found in any *.py files.")

def main():
    parser = argparse.ArgumentParser(
        description="Find and remove shebangs from *.py files based on location and path type.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "-p", "--path",
        default="./env",
        help="The path to the directory to scan (default: './env')."
    )
    parser.add_argument(
        "-s", "--show-only",
        action="store_true",
        help="List *.py files containing shebangs without modifying them.\nWhen this flag is used, other options are ignored."
    )
    parser.add_argument(
        "--mode",
        default="top",
        choices=['any', 'top'],
        help="""Specifies where to look for shebangs:
  top - only remove a shebang if it is on the first line. (default)
  any - remove any line that is a shebang, anywhere in the file."""
    )
    parser.add_argument(
        "--paths",
        default="local",
        choices=['local', 'non-local', 'all'],
        help="""Filters which shebangs to remove based on their path:
  local     - remove shebangs with environment-specific or user paths.
            (e.g., /home/user/env/bin/python, C:\\Users\\user\\env\\...) (default)
  non-local - remove shebangs with common system paths.
            (e.g., /usr/bin/env, /bin/bash)
  all       - remove all shebangs that are found."""
    )
    args = parser.parse_args()
    process_shebangs(args.path, args.mode, args.paths, args.show_only)

if __name__ == "__main__":
    main()
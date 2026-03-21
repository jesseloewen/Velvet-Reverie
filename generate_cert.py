"""
Generate Self-Signed SSL Certificates for HTTPS
Enables browser notifications on local network devices

Run: python generate_cert.py
"""

import subprocess
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
import ipaddress

def check_cryptography():
    """Check if cryptography module is available"""
    try:
        import cryptography
        return True
    except ImportError:
        return False

def generate_with_cryptography():
    """Generate certificate using Python cryptography library (most reliable)"""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
    except ImportError:
        print("✗ cryptography module not found!")
        print("\nInstalling cryptography...")
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', 'cryptography'], check=True)
            print("✓ cryptography installed successfully")
            # Import again after installation
            from cryptography import x509
            from cryptography.x509.oid import NameOID
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.asymmetric import rsa
            from cryptography.hazmat.primitives import serialization
        except Exception as e:
            print(f"✗ Failed to install cryptography: {e}")
            return False
    
    cert_file = Path('cert.pem')
    key_file = Path('key.pem')
    
    # Check if certificates already exist
    if cert_file.exists() or key_file.exists():
        print("\n⚠️  Certificate files already exist:")
        if cert_file.exists():
            print(f"  - {cert_file}")
        if key_file.exists():
            print(f"  - {key_file}")
        
        response = input("\nOverwrite existing certificates? (y/N): ").strip().lower()
        if response != 'y':
            print("Cancelled. Keeping existing certificates.")
            return False
    
    print("\n" + "=" * 60)
    print("Generating self-signed SSL certificate...")
    print("=" * 60)
    
    try:
        # Generate private key
        print("Generating RSA private key (4096 bits)...")
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=4096,
        )
        
        # Generate certificate
        print("Creating certificate...")
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Local Development"),
            x509.NameAttribute(NameOID.COMMON_NAME, "Velvet Reverie"),
        ])
        
        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            private_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.now(timezone.utc)
        ).not_valid_after(
            datetime.now(timezone.utc) + timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            ]),
            critical=False,
        ).sign(private_key, hashes.SHA256())
        
        # Write private key to file
        print(f"Writing private key to {key_file}...")
        with open(key_file, "wb") as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        # Write certificate to file
        print(f"Writing certificate to {cert_file}...")
        with open(cert_file, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        
        print("\n✓ Certificate generated successfully!\n")
        print(f"  Certificate: {cert_file.absolute()}")
        print(f"  Private Key: {key_file.absolute()}")
        print(f"  Valid for: 365 days")
        
        print("\n" + "=" * 60)
        print("NEXT STEPS:")
        print("=" * 60)
        print("1. Enable SSL in your .env file:")
        print("   ENABLE_SSL=True")
        print("\n2. Restart the Flask app:")
        print("   python app.py")
        print("\n3. Access via HTTPS:")
        print("   https://localhost:4879")
        print("   https://192.168.x.x:4879 (from other devices)")
        print("\n4. Accept the security warning in your browser:")
        print("   - Click 'Advanced' or 'Details'")
        print("   - Click 'Proceed to localhost' or 'Accept Risk'")
        print("   - This is safe for local development")
        print("\n5. Browser notifications will now work on all devices!")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n✗ Certificate generation failed!")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def check_openssl():
    """Check if OpenSSL is available"""
    try:
        result = subprocess.run(['openssl', 'version'], 
                              capture_output=True, 
                              text=True, 
                              check=True)
        print(f"✓ OpenSSL found: {result.stdout.strip()}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def generate_certificate():
    """Generate self-signed certificate and key"""
    cert_file = Path('cert.pem')
    key_file = Path('key.pem')
    
    # Check if certificates already exist
    if cert_file.exists() or key_file.exists():
        print("\n⚠️  Certificate files already exist:")
        if cert_file.exists():
            print(f"  - {cert_file}")
        if key_file.exists():
            print(f"  - {key_file}")
        
        response = input("\nOverwrite existing certificates? (y/N): ").strip().lower()
        if response != 'y':
            print("Cancelled. Keeping existing certificates.")
            return False
    
    print("\n" + "=" * 60)
    print("Generating self-signed SSL certificate...")
    print("=" * 60)
    print("\nYou'll be asked for certificate information.")
    print("You can press Enter to use defaults for most fields.")
    print("=" * 60)
    
    # Build OpenSSL command
    cmd = [
        'openssl', 'req', '-x509',
        '-newkey', 'rsa:4096',
        '-nodes',  # Don't encrypt private key
        '-out', str(cert_file),
        '-keyout', str(key_file),
        '-days', '365',  # Valid for 1 year
        '-sha256',
        '-subj', '/CN=Velvet Reverie/O=Local Development/C=US'
    ]
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        
        print("\n✓ Certificate generated successfully!\n")
        print(f"  Certificate: {cert_file.absolute()}")
        print(f"  Private Key: {key_file.absolute()}")
        print(f"  Valid for: 365 days")
        
        print("\n" + "=" * 60)
        print("NEXT STEPS:")
        print("=" * 60)
        print("1. Enable SSL in your .env file:")
        print("   ENABLE_SSL=True")
        print("\n2. Restart the Flask app:")
        print("   python app.py")
        print("\n3. Access via HTTPS:")
        print("   https://localhost:4879")
        print("   https://192.168.x.x:4879 (from other devices)")
        print("\n4. Accept the security warning in your browser:")
        print("   - Click 'Advanced' or 'Details'")
        print("   - Click 'Proceed to localhost' or 'Accept Risk'")
        print("   - This is safe for local development")
        print("\n5. Browser notifications will now work on all devices!")
        print("=" * 60)
        
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"\n✗ Certificate generation failed!")
        print(f"Error: {e.stderr}")
        return False

def main():
    print("=" * 60)
    print("VELVET REVERIE - SSL Certificate Generator")
    print("=" * 60)
    
    # Try Python cryptography library first (most reliable, cross-platform)
    print("\nMethod: Python cryptography library")
    if generate_with_cryptography():
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == '__main__':
    main()
